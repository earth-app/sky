#!/usr/bin/env bash
# runs sky's android native test tiers: jvm unit tests (no emulator) and the instrumented lane

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MODE="${1:-unit}"

ANDROID_DIR="$ROOT/android"
GRADLEW="$ANDROID_DIR/gradlew"
APK="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
APP_ID='com.earthapp.sky'

WORK_DIR="${NATIVE_WORK_DIR:-/tmp/sky-native-android}"

ADB=''
EMULATOR=''
SERIAL=''
STARTED_EMULATOR=0
MOCK_PID=''
MOCK_LOG=''
# bash 3.2 (the macos default, and what github's macos runners use for `run:`) exits 0 on a
# `set -u` abort inside a function, so success has to be stated, not assumed
COMPLETED=0

# stderr, so a function that logs can still return a value on stdout
log() { printf '\n[native-android] %s\n' "$*" >&2; }
warn() { printf '[native-android] warning: %s\n' "$*" >&2; }

die() {
	printf '\n[native-android] FAILED: %s\n' "$*" >&2
	exit 1
}

on_err() {
	printf '\n[native-android] FAILED (exit %s) at: %s\n' "$1" "$2" >&2
	if [ -n "$MOCK_LOG" ] && [ -s "$MOCK_LOG" ]; then
		printf '[native-android] mock server log: %s\n' "$MOCK_LOG" >&2
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
		printf '\n[native-android] FAILED: the run aborted before finishing (see the error above)\n' >&2
		exit 1
	fi
	exit "$rc"
}

trap 'on_err "$?" "$BASH_COMMAND"' ERR
trap cleanup EXIT INT TERM

require_cmd() {
	command -v "$1" > /dev/null 2>&1 || die "$1 is required but not on PATH${2:+ ($2)}"
}

# #region prerequisites

require_java() {
	local home version major
	home="${JAVA_HOME:-}"
	if [ -n "$home" ] && [ -x "$home/bin/java" ]; then
		JAVA_BIN="$home/bin/java"
	else
		require_cmd java 'install a jdk 17-21; agp 8.13 does not support newer'
		JAVA_BIN="$(command -v java)"
	fi
	version="$("$JAVA_BIN" -version 2>&1 | head -1 | sed -n 's/.*[version|openjdk] "\{0,1\}\([0-9][0-9]*\).*/\1/p')"
	[ -n "$version" ] || die "could not read a java version from: $("$JAVA_BIN" -version 2>&1 | head -1)"
	major="$version"
	[ "$major" -ge 17 ] || die "java $major is too old; agp 8.13.2 needs jdk 17 or newer"
	if [ "$major" -gt 21 ]; then
		warn "java $major is newer than agp 8.13.2 supports; set JAVA_HOME to a jdk 21 if gradle fails"
	fi
	log "java $major at $JAVA_BIN"
}

require_gradle() {
	[ -x "$GRADLEW" ] || die "no gradle wrapper at $GRADLEW"
	[ -f "$ANDROID_DIR/gradle/wrapper/gradle-wrapper.jar" ] \
		|| die 'the gradle wrapper jar is missing; re-checkout android/gradle/wrapper'
}

# every agp 8.x calls org.gradle.api.problems.internal.InternalProblems, removed in gradle 9.6.0.
# a wrapper bump past 9.5.x therefore fails at configuration with an unrelated-looking message, so
# catch it here with the real reason instead
assert_gradle_agp_compat() {
	local dist agp gradle_major gradle_minor agp_major
	dist="$(sed -n 's/^distributionUrl=.*gradle-\([0-9.]*\)-.*$/\1/p' "$ANDROID_DIR/gradle/wrapper/gradle-wrapper.properties")"
	agp="$(sed -n "s/.*com.android.tools.build:gradle:\([0-9.]*\).*/\1/p" "$ANDROID_DIR/build.gradle" | head -1)"
	[ -n "$dist" ] || die 'could not read the gradle version from gradle-wrapper.properties'
	[ -n "$agp" ] || die 'could not read the agp version from android/build.gradle'
	gradle_major="${dist%%.*}"
	gradle_minor="$(printf '%s' "$dist" | cut -d. -f2)"
	agp_major="${agp%%.*}"
	if [ "$agp_major" -lt 9 ] && [ "$gradle_major" -ge 9 ] && [ "$gradle_minor" -ge 6 ]; then
		die "gradle $dist cannot run agp $agp: agp 8.x uses InternalProblems, removed in gradle 9.6.0.
       pin the wrapper back to a 9.5.x distribution, or migrate to agp 9 across every capacitor
       plugin module first"
	fi
	log "gradle $dist + agp $agp"
}

# capacitor-cordova-android-plugins and the per-plugin gradle modules are gitignored, so a fresh
# checkout cannot configure the build until they are regenerated
ensure_capacitor_modules() {
	if [ -f "$ANDROID_DIR/capacitor-cordova-android-plugins/build.gradle" ]; then return 0; fi
	require_cmd bun
	# sync, not update: `cap update` writes build.gradle but not cordova.variables.gradle, and
	# capacitor.build.gradle includes that file unconditionally, so gradle dies on a half module
	log 'regenerating the capacitor gradle modules (cap sync android)'
	# everything under assets/ is gitignored, so a fresh checkout has no directory for
	# the sync to write capacitor.plugins.json into
	mkdir -p "$ANDROID_DIR/app/src/main/assets"
	# the copy step needs a webDir and the jvm lane never builds the web app; stand a placeholder
	# in and take it back out, so nothing can later boot off an empty bundle
	local placeholder=''
	if [ ! -f "$ROOT/.output/public/index.html" ]; then
		placeholder="$ROOT/.output/public"
		mkdir -p "$placeholder"
		: > "$placeholder/index.html"
	fi
	bunx cap sync android
	if [ -n "$placeholder" ]; then
		rm -f "$placeholder/index.html" "$ANDROID_DIR/app/src/main/assets/public/index.html"
		rmdir "$placeholder" "$ROOT/.output" 2> /dev/null || true
	fi
	[ -f "$ANDROID_DIR/capacitor-cordova-android-plugins/cordova.variables.gradle" ] \
		|| die 'cap sync android did not produce a complete capacitor-cordova-android-plugins'
}

resolve_sdk() {
	local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
	if [ -z "$sdk" ]; then
		for candidate in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk" /usr/local/lib/android/sdk; do
			if [ -d "$candidate" ]; then
				sdk="$candidate"
				break
			fi
		done
	fi
	[ -n "$sdk" ] && [ -d "$sdk" ] || die 'android sdk not found; install it and set ANDROID_HOME'
	export ANDROID_HOME="$sdk"
	export ANDROID_SDK_ROOT="$sdk"
	ADB="$sdk/platform-tools/adb"
	EMULATOR="$sdk/emulator/emulator"
	[ -x "$ADB" ] || die "no adb at $ADB; install platform-tools via sdkmanager"
	log "android sdk at $sdk"
}

# #endregion

# #region dotenv -> mock ports

dotenv_path() {
	for candidate in "$ROOT/.config/native-android.env" "$ROOT/.config/maestro-android.env"; do
		if [ -f "$candidate" ]; then
			printf '%s' "$candidate"
			return 0
		fi
	done
	die 'no .config/native-android.env (nor the older maestro-android.env); the instrumented lane
       needs one to pin the mock ports the bundle is built against'
}

dotenv_value() {
	local file="$1" key="$2" line
	line="$(grep -E "^${key}=" "$file" | tail -1 || true)"
	[ -n "$line" ] || die "$key is not set in $file"
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
		*) die "no port in $1; the native dotenvs must pin one so the mock servers match" ;;
	esac
}

# #endregion

# #region mock backends

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
	local dotenv="$1"
	log "building the web bundle with $dotenv"
	NODE_OPTIONS='--max-old-space-size=8192' bunx nuxi build --dotenv "$dotenv"
}

# `ssr: false` bakes the base urls into the entry html, so a bundle built for another lane silently
# talks to a port with nothing behind it
assert_bundle_host() {
	local expected="$1" entry="${2:-$ROOT/.output/public/200.html}"
	[ -f "$entry" ] || die "no $entry after the build"
	grep -q "$expected" "$entry" \
		|| die "the bundle was not built for $expected; delete .output and re-run"
	log "bundle points at $expected"
}

# #endregion

# #region device

connected_serial() {
	"$ADB" devices | awk '$2 == "device" { print $1; exit }'
}

boot_emulator() {
	local avd="${NATIVE_AVD:-}" tries=0
	[ -x "$EMULATOR" ] || die "no emulator binary at $EMULATOR"
	if [ -z "$avd" ]; then
		avd="$("$EMULATOR" -list-avds | head -1 || true)"
	fi
	[ -n "$avd" ] || die 'no avd available; create one with avdmanager, or set NATIVE_AVD'

	log "booting emulator $avd"
	mkdir -p "$WORK_DIR"
	nohup "$EMULATOR" -avd "$avd" -no-snapshot-save -no-boot-anim -netdelay none -netspeed full \
		> "$WORK_DIR/emulator.log" 2>&1 &
	STARTED_EMULATOR=1

	SERIAL=''
	while [ "$tries" -lt 150 ]; do
		SERIAL="$(connected_serial)"
		if [ -n "$SERIAL" ]; then break; fi
		tries=$((tries + 1))
		sleep 2
	done
	[ -n "$SERIAL" ] || die "the emulator never showed up in adb; see $WORK_DIR/emulator.log"

	tries=0
	while [ "$tries" -lt 150 ]; do
		if [ "$("$ADB" -s "$SERIAL" shell getprop sys.boot_completed 2> /dev/null | tr -d '\r')" = '1' ]; then
			return 0
		fi
		tries=$((tries + 1))
		sleep 2
	done
	die "the emulator booted but never reported sys.boot_completed; see $WORK_DIR/emulator.log"
}

# gboard's insets-show animation never completes on a software-rendered emulator and stalls the
# whole window for the flow timeout. androidx test injects input through the instrumentation, so no
# ime is needed at all
disable_ime() {
	local serial="$1" ime
	for ime in $("$ADB" -s "$serial" shell ime list -s 2> /dev/null | tr -d '\r'); do
		[ -n "$ime" ] || continue
		"$ADB" -s "$serial" shell ime disable "$ime" > /dev/null 2>&1 || true
	done
	"$ADB" -s "$serial" shell settings put secure show_ime_with_hard_keyboard 0 > /dev/null 2>&1 || true
}

# #endregion

gradle() {
	(cd "$ANDROID_DIR" && ./gradlew --console=plain "$@")
}

run_unit() {
	log 'tier 1: jvm unit tests (no emulator)'
	gradle :app:testDebugUnitTest
	log "report: $ANDROID_DIR/app/build/reports/tests/testDebugUnitTest/index.html"
}

run_compile() {
	log 'compiling the instrumented tests without running them'
	gradle :app:assembleDebugAndroidTest
}

run_instrumented() {
	local dotenv api_url cloud_url mantle_port cloud_port
	dotenv="$(dotenv_path)"
	api_url="$(dotenv_value "$dotenv" NUXT_PUBLIC_API_BASE_URL)"
	cloud_url="$(dotenv_value "$dotenv" NUXT_PUBLIC_CLOUD_BASE_URL)"
	# via variables, so a malformed url fails the assignment instead of passing an empty arg
	mantle_port="$(url_port "$api_url")"
	cloud_port="$(url_port "$cloud_url")"

	require_cmd bun
	resolve_sdk

	start_mocks "$mantle_port" "$cloud_port"

	if [ "${NATIVE_SKIP_BUILD:-0}" = '1' ]; then
		warn 'NATIVE_SKIP_BUILD=1; reusing whatever is already in android/app/src/main/assets/public'
		# a bundle built for another lane points at production and cannot reach the mocks or the
		# observation bus, which reads as "no breadcrumb arrived" rather than as the wrong bundle
		assert_bundle_host "$(url_authority "$api_url")" \
			"$ANDROID_DIR/app/src/main/assets/public/200.html"
	else
		build_web "$dotenv"
		assert_bundle_host "$(url_authority "$api_url")"
		log 'syncing the capacitor android project'
		bunx cap sync android
	fi

	log 'assembling the debug apk'
	gradle :app:assembleDebug
	[ -f "$APK" ] || die "gradle produced no apk at $APK"

	# ci hands us a booted emulator (reactivecircus/android-emulator-runner), so only boot one
	# when nothing is attached
	SERIAL="$(connected_serial)"
	if [ -z "$SERIAL" ]; then
		boot_emulator
	fi
	log "using device $SERIAL"
	disable_ime "$SERIAL"

	# a clean install, and deliberately NOT `install -g`: PermissionTest needs the runtime
	# permissions in their un-asked state, and -g pre-grants every one of them so the whole
	# grant/deny ladder would pass vacuously
	log "installing $APK with runtime permissions un-granted"
	"$ADB" -s "$SERIAL" uninstall "$APP_ID" > /dev/null 2>&1 || true
	"$ADB" -s "$SERIAL" install "$APK"

	local -a gradle_args=(:app:connectedDebugAndroidTest)
	if [ -n "${NATIVE_TEST_CLASS:-}" ]; then
		gradle_args+=("-Pandroid.testInstrumentationRunnerArguments.class=$NATIVE_TEST_CLASS")
		log "restricted to $NATIVE_TEST_CLASS"
	fi

	log 'tier 2: instrumented tests'
	ANDROID_SERIAL="$SERIAL" gradle "${gradle_args[@]}"
	log "report: $ANDROID_DIR/app/build/reports/androidTests/connected/debug/index.html"

	if [ "$STARTED_EMULATOR" = '1' ]; then
		log "emulator $SERIAL left running; stop it with: $ADB -s $SERIAL emu kill"
	fi
}

require_java
require_gradle
assert_gradle_agp_compat
ensure_capacitor_modules

case "$MODE" in
	unit) run_unit ;;
	compile) run_compile ;;
	instrumented) run_instrumented ;;
	all)
		run_unit
		run_instrumented
		;;
	*) die "unknown mode '$MODE'; expected one of: unit, compile, instrumented, all" ;;
esac

finish
