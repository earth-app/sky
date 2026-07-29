#!/usr/bin/env bash
# shared plumbing for the maestro lanes; sourced by maestro-ios.sh / maestro-android.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# maestro enables anonymous telemetry by default; a build tool should not phone home
export MAESTRO_CLI_NO_ANALYTICS=1

WORK_DIR="${MAESTRO_WORK_DIR:-/tmp/sky-maestro}"
SHOT_DIR="${MAESTRO_SHOT_DIR:-/tmp/maestro-shots}"
TAGS="${MAESTRO_TAGS:-gate}"
# the workspace root, not flows/: config.yaml's `flows:` globs are relative to it
WORKSPACE="${MAESTRO_WORKSPACE:-$ROOT/.maestro}"
CONFIG_FILE="$WORKSPACE/config.yaml"

PLATFORM=''
REPRODUCE=''
MAESTRO=''
MOCK_PID=''
MOCK_LOG=''
# bash 3.2 (the macos default, and what GitHub's macos runners use for `run:`) exits 0
# on a `set -u` abort inside a function, so success has to be stated, not assumed
COMPLETED=0

# stderr, so a function that logs can still return a value on stdout
log() { printf '\n[maestro] %s\n' "$*" >&2; }
warn() { printf '[maestro] warning: %s\n' "$*" >&2; }

hint() {
	if [ -n "$REPRODUCE" ]; then
		printf '[maestro] reproduce: %s\n' "$REPRODUCE" >&2
	fi
}

die() {
	printf '\n[maestro] FAILED: %s\n' "$*" >&2
	hint
	exit 1
}

on_err() {
	printf '\n[maestro] FAILED (exit %s) at: %s\n' "$1" "$2" >&2
	if [ -n "$MOCK_LOG" ] && [ -s "$MOCK_LOG" ]; then
		printf '[maestro] mock server log: %s\n' "$MOCK_LOG" >&2
	fi
	hint
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
		printf '\n[maestro] FAILED: the run aborted before finishing (see the error above)\n' >&2
		hint
		exit 1
	fi
	exit "$rc"
}

trap 'on_err "$?" "$BASH_COMMAND"' ERR
trap cleanup EXIT INT TERM

require_cmd() {
	command -v "$1" > /dev/null 2>&1 || die "$1 is required but not on PATH${2:+ ($2)}"
}

# #region maestro cli

resolve_maestro() {
	if command -v maestro > /dev/null 2>&1; then
		MAESTRO="$(command -v maestro)"
	elif [ -x "$HOME/.maestro/bin/maestro" ]; then
		MAESTRO="$HOME/.maestro/bin/maestro"
	else
		die "maestro cli not found; install it with: curl -Ls https://get.maestro.mobile.dev | bash"
	fi
	require_cmd java 'maestro needs a jdk 17 or newer'
	log "maestro $("$MAESTRO" --version 2> /dev/null | tail -1) at $MAESTRO"
}

# #endregion

# #region dotenv -> mock ports

dotenv_value() {
	local file="$1" key="$2" line
	[ -f "$file" ] || die "missing dotenv $file"
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
		*) die "no port in $1; the maestro dotenvs must pin one so the mock servers match" ;;
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
		if [ "${MAESTRO_REUSE_MOCKS:-0}" = '1' ]; then
			warn "reusing whatever is already listening on$busy"
			return 0
		fi
		first="${busy# }"
		first="${first%% *}"
		die "port(s)$busy are already in use - another lane (bun run test:e2e) is probably holding them.
       find the holder: lsof -nP -iTCP:$first -sTCP:LISTEN
       stop it, or re-run with MAESTRO_REUSE_MOCKS=1 to test against the servers already there"
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

# #region flows

run_flows() {
	local device="$1" out_dir="$WORK_DIR/$PLATFORM" artifacts junit
	junit="$out_dir/report.xml"
	if [ "$TAGS" = 'eval' ]; then
		artifacts="$SHOT_DIR/$PLATFORM"
	else
		artifacts="$out_dir/artifacts"
	fi
	# each run starts clean, or the eval lane would score stale frames
	case "$artifacts" in
		/*/*) rm -rf "$artifacts" ;;
		*) die "refusing to clear a suspicious artifacts path: '$artifacts'" ;;
	esac
	mkdir -p "$artifacts" "$out_dir"

	local -a config_args=()
	if [ -f "$CONFIG_FILE" ]; then
		# pass it explicitly; maestro only auto-discovers config.yaml in the folder it is given
		config_args=(--config "$CONFIG_FILE")
	else
		warn "no $CONFIG_FILE; running without a workspace config"
	fi

	[ -d "$WORKSPACE/flows" ] || warn "no flows at $WORKSPACE/flows yet"

	# a comma-separated udid list means one device per shard: maestro splits the flows evenly
	# across them, so the lane still runs EVERY flow, it just runs them concurrently
	local -a shard_args=()
	local shard_count
	shard_count="$(printf '%s' "$device" | awk -F, '{ print NF }')"
	if [ "${shard_count:-1}" -gt 1 ]; then
		shard_args=(--shard-split "$shard_count")
		log "splitting flows across $shard_count devices"
	fi

	log "running '$TAGS' flows from $WORKSPACE on $device"
	"$MAESTRO" test \
		--udid "$device" \
		${shard_args[@]+"${shard_args[@]}"} \
		--include-tags="$TAGS" \
		--format=JUNIT \
		--output="$junit" \
		--test-output-dir="$artifacts" \
		${config_args[@]+"${config_args[@]}"} \
		-e SHOT_DIR="$artifacts" \
		"$WORKSPACE"

	log "junit report: $junit"
	log "artifacts:    $artifacts"
}

# #endregion
