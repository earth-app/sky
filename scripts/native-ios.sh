#!/usr/bin/env bash
# runs the native ios test tiers: pure swift logic, the plugin bridge bundle, and the xcuitest ui bundle

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MODE="${1:-logic}"

WORK_DIR="${NATIVE_WORK_DIR:-/tmp/sky-native-ios}"
DERIVED="${NATIVE_DERIVED_DATA:-$WORK_DIR/derived-data}"
RESULTS="$WORK_DIR/results"
PROJECT="$ROOT/ios/App/App.xcodeproj"
PACKAGE="$ROOT/ios/App/SkyKit"
BOOT_TIMEOUT="${NATIVE_IOS_BOOT_TIMEOUT:-300}"
BUNDLE_ID='com.earthapp.sky'

MOCK_PID=''
MOCK_LOG=''
# bash 3.2 (the macos default, and what github's macos runners use for `run:`) exits 0 on a
# `set -u` abort inside a function, so success has to be stated, not assumed
COMPLETED=0

# stderr, so a function that logs can still return a value on stdout
log() { printf '\n[native-ios] %s\n' "$*" >&2; }
warn() { printf '[native-ios] warning: %s\n' "$*" >&2; }

die() {
	printf '\n[native-ios] FAILED: %s\n' "$*" >&2
	exit 1
}

on_err() {
	printf '\n[native-ios] FAILED (exit %s) at: %s\n' "$1" "$2" >&2
	if [ -n "$MOCK_LOG" ] && [ -s "$MOCK_LOG" ]; then
		printf '[native-ios] mock server log: %s\n' "$MOCK_LOG" >&2
	fi
}

finish() { COMPLETED=1; }

cleanup() {
	local rc=$?
	if [ -n "$MOCK_PID" ] && kill -0 "$MOCK_PID" 2> /dev/null; then
		kill "$MOCK_PID" 2> /dev/null || true
		wait "$MOCK_PID" 2> /dev/null || true
		# an orphaned mock holds the ports and breaks the next run, so make sure
		if kill -0 "$MOCK_PID" 2> /dev/null; then
			kill -9 "$MOCK_PID" 2> /dev/null || true
		fi
	fi
	if [ "$COMPLETED" != '1' ] && [ "$rc" -eq 0 ]; then
		printf '\n[native-ios] FAILED: the run aborted before finishing (see the error above)\n' >&2
		exit 1
	fi
	exit "$rc"
}

trap 'on_err "$?" "$BASH_COMMAND"' ERR
trap cleanup EXIT INT TERM

usage() {
	cat >&2 << 'EOF'
usage: scripts/native-ios.sh [logic|unit|ui|all]

  logic  SkyKit swift package tests            no simulator, no backend   (~5s)
  unit   AppTests plugin-bridge bundle         simulator, no app launch   (~2m)
  ui     AppUITests xcuitest bundle            simulator + web build + mocks
  all    every tier in that order
EOF
}

# #region platform gate

require_macos() {
	local os
	os="$(uname -s)"
	[ "$os" = 'Darwin' ] || die "the ios lane only runs on macOS (this is $os).
       there is no way to build or run an ios test bundle on another platform;
       run scripts/native-android.sh instead, or use a macOS runner"
}

require_cmd() {
	command -v "$1" > /dev/null 2>&1 || die "$1 is required but not on PATH${2:+ ($2)}"
}

require_xcode() {
	require_cmd xcodebuild 'install Xcode and run xcode-select --install'
	require_cmd xcrun 'install the Xcode command line tools'
	# a Command Line Tools-only install has xcodebuild but no sdk, and fails much later
	xcodebuild -version > /dev/null 2>&1 \
		|| die "xcodebuild cannot run; point it at a full Xcode with:
       sudo xcode-select -s /Applications/Xcode.app"
	log "$(xcodebuild -version | tr '\n' ' ')"
}

# #endregion

# #region dotenv and ports

DOTENV=''

resolve_dotenv() {
	for candidate in "$ROOT/.config/native-ios.env" "$ROOT/.config/maestro-ios.env"; do
		if [ -f "$candidate" ]; then
			DOTENV="$candidate"
			log "using $DOTENV"
			return 0
		fi
	done
	die "no dotenv at .config/native-ios.env (or .config/maestro-ios.env).
       the ui lane needs the mock base urls pinned there, because ssr:false bakes
       them into the bundle at build time"
}

dotenv_value() {
	local key="$1" line
	line="$(grep -E "^${key}=" "$DOTENV" | tail -1 || true)"
	[ -n "$line" ] || die "$key is not set in $DOTENV"
	printf '%s' "${line#*=}"
}

url_authority() {
	local rest="${1#*://}"
	printf '%s' "${rest%%/*}"
}

url_port() {
	local authority
	authority="$(url_authority "$1")"
	case "$authority" in
		*:*) printf '%s' "${authority##*:}" ;;
		*) die "no port in $1; the dotenv must pin one so the mock servers match" ;;
	esac
}

port_busy() {
	local code=0
	curl -s -o /dev/null -m 2 "http://127.0.0.1:$1/" || code=$?
	# 7 is the only "nothing is listening" exit; a 404 from the mock still counts as up
	if [ "$code" -eq 7 ]; then return 1; fi
	return 0
}

wait_for_port() {
	local port="$1" tries=0
	while [ "$tries" -lt 80 ]; do
		if port_busy "$port"; then return 0; fi
		tries=$((tries + 1))
		sleep 0.25
	done
	die "the mock server never came up on port $port; see $MOCK_LOG"
}

start_mocks() {
	local mantle="$1" cloud="$2" busy='' first=''
	for port in "$mantle" "$cloud"; do
		if port_busy "$port"; then busy="$busy $port"; fi
	done
	if [ -n "$busy" ]; then
		if [ "${NATIVE_REUSE_MOCKS:-0}" = '1' ]; then
			warn "reusing whatever is already listening on$busy"
			return 0
		fi
		first="${busy# }"
		first="${first%% *}"
		die "port(s)$busy are already in use - another lane (bun run test:e2e) is probably holding them.
       find the holder: lsof -nP -iTCP:$first -sTCP:LISTEN
       stop it, or re-run with NATIVE_REUSE_MOCKS=1 to test against the servers already there"
	fi

	mkdir -p "$WORK_DIR"
	MOCK_LOG="$WORK_DIR/mock-server.log"
	log "starting the mock backends (mantle $mantle, cloud $cloud)"
	MOCK_MANTLE_PORT="$mantle" MOCK_CLOUD_PORT="$cloud" \
		bun tests/e2e/utils/mock-server.ts > "$MOCK_LOG" 2>&1 &
	MOCK_PID=$!
	wait_for_port "$mantle"
	wait_for_port "$cloud"
}

# #endregion

# #region web bundle

build_web() {
	log "building the web bundle with $DOTENV"
	NODE_OPTIONS='--max-old-space-size=8192' bunx nuxi build --dotenv "$DOTENV"
}

# `ssr: false` bakes the base urls into the entry html, so a bundle built for another
# lane silently talks to a port with nothing behind it
assert_bundle_host() {
	local expected="$1" entry="$ROOT/.output/public/200.html"
	[ -f "$entry" ] || die "no .output/public/200.html after the build"
	grep -q "$expected" "$entry" \
		|| die "the bundle was not built for $expected; delete .output and re-run"
	log "bundle points at $expected"
}

# #endregion

# #region simulator

# deliberately NOT "whatever is already booted": an older-runtime simulator left booted breaks
# the install. NATIVE_IOS_DEVICE overrides it
pick_simulator() {
	local udid=''
	if [ -n "${NATIVE_IOS_DEVICE:-}" ]; then
		printf '%s' "$NATIVE_IOS_DEVICE"
		return 0
	fi
	# runtimes are listed oldest first, so the last iphone is on the newest one available
	udid="$(xcrun simctl list devices available | grep -E '^[[:space:]]+iPhone' \
		| grep -Eo '\([0-9A-Fa-f-]{36}\)' | tr -d '()' | tail -1 || true)"
	[ -n "$udid" ] || die "no available iphone simulator; create one in Xcode > Devices"
	printf '%s' "$udid"
}

boot_simulator() {
	local udid="$1" boot_log="$WORK_DIR/bootstatus-$udid.log" waited=0 boot_pid status=0
	log "booting simulator $udid (timeout ${BOOT_TIMEOUT}s)"
	mkdir -p "$WORK_DIR"

	# bounded AND chatty on purpose: bootstatus blocks with its output redirected, so a hung
	# boot used to burn a whole ci job and emit nothing to explain it
	xcrun simctl bootstatus "$udid" -b > "$boot_log" 2>&1 &
	boot_pid=$!
	while kill -0 "$boot_pid" 2> /dev/null; do
		if [ "$waited" -ge "$BOOT_TIMEOUT" ]; then
			kill -9 "$boot_pid" 2> /dev/null || true
			warn "last lines of $boot_log:"
			tail -20 "$boot_log" >&2
			die "simulator $udid never booted within ${BOOT_TIMEOUT}s"
		fi
		sleep 5
		waited=$((waited + 5))
	done
	wait "$boot_pid" || status=$?
	[ "$status" -eq 0 ] || die "the simulator never reached a booted state; see $boot_log"
	log "simulator $udid booted"
}

# the permission tests need a known starting state, not whatever the last run left behind
reset_privacy() {
	local udid="$1"
	for service in camera microphone photos location motion health; do
		xcrun simctl privacy "$udid" reset "$service" "$BUNDLE_ID" > /dev/null 2>&1 || true
	done
	log 'privacy state reset for every permission the app requests'
}

# #endregion

# #region tiers

run_logic() {
	log 'tier 1: SkyKit swift package (no simulator)'
	swift test --package-path "$PACKAGE"
}

run_bundle() {
	local bundle="$1" udid="$2"
	mkdir -p "$RESULTS"
	rm -rf "$RESULTS/$bundle.xcresult"
	# -destination beats -sdk: the App target embeds Watch.app and -sdk iphonesimulator
	# breaks a project with a watch target
	xcodebuild test \
		-project "$PROJECT" \
		-scheme App \
		-configuration Debug \
		-destination "platform=iOS Simulator,id=$udid" \
		-derivedDataPath "$DERIVED" \
		-resultBundlePath "$RESULTS/$bundle.xcresult" \
		-only-testing:"$bundle" \
		CODE_SIGNING_ALLOWED=NO \
		CODE_SIGNING_REQUIRED=NO \
		ONLY_ACTIVE_ARCH=YES \
		TEST_RUNNER_SKY_MOCK_BASE_URL="${SKY_MOCK_BASE_URL:-}" \
		test
	log "result bundle: $RESULTS/$bundle.xcresult"
}

run_unit() {
	local udid
	udid="$(pick_simulator)"
	boot_simulator "$udid"
	log 'tier 2a: AppTests plugin-bridge bundle (simulator, no app launch)'
	run_bundle AppTests "$udid"
}

run_ui() {
	require_cmd bun
	resolve_dotenv

	local api_url cloud_url mantle_port cloud_port udid
	api_url="$(dotenv_value NUXT_PUBLIC_API_BASE_URL)"
	cloud_url="$(dotenv_value NUXT_PUBLIC_CLOUD_BASE_URL)"
	mantle_port="$(url_port "$api_url")"
	cloud_port="$(url_port "$cloud_url")"
	export SKY_MOCK_BASE_URL="$api_url"

	start_mocks "$mantle_port" "$cloud_port"
	build_web
	assert_bundle_host "$(url_authority "$api_url")"

	log 'syncing the capacitor ios project'
	bunx cap sync ios

	udid="$(pick_simulator)"
	boot_simulator "$udid"
	reset_privacy "$udid"
	# the window server makes wkwebview rendering behave
	open -a Simulator --args -CurrentDeviceUDID "$udid" > /dev/null 2>&1 || true

	log 'tier 2b: AppUITests xcuitest bundle'
	run_bundle AppUITests "$udid"
}

# #endregion

require_macos

case "$MODE" in
	logic)
		run_logic
		;;
	unit)
		require_xcode
		run_unit
		;;
	ui)
		require_xcode
		run_ui
		;;
	all)
		require_xcode
		run_logic
		run_unit
		run_ui
		;;
	-h | --help | help)
		usage
		finish
		exit 0
		;;
	*)
		usage
		die "unknown mode '$MODE'"
		;;
esac

finish
