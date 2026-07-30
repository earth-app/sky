#!/usr/bin/env bash
# builds sky for the ios simulator against the mock backends and runs the maestro flows

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/maestro-common.sh"

PLATFORM='ios'
REPRODUCE='bun run maestro:ios'

BOOT_TIMEOUT="${MAESTRO_IOS_BOOT_TIMEOUT:-300}"

DOTENV="$ROOT/.config/maestro-ios.env"
DERIVED="${MAESTRO_DERIVED_DATA:-$WORK_DIR/derived-data-ios}"
APP_PATH="$DERIVED/Build/Products/Debug-iphonesimulator/App.app"

# the whole simulator lane lives on the host loopback; a device would need its own dotenv
api_url="$(dotenv_value "$DOTENV" NUXT_PUBLIC_API_BASE_URL)"
cloud_url="$(dotenv_value "$DOTENV" NUXT_PUBLIC_CLOUD_BASE_URL)"
# via variables, so a malformed url fails the assignment instead of passing an empty arg
mantle_port="$(url_port "$api_url")"
cloud_port="$(url_port "$cloud_url")"

# #region device

# deliberately NOT "whatever is already booted": an older-runtime simulator left booted
# made maestro fail with "Failed to get app binary directory", so the pick stays
# deterministic and matches what ci does. MAESTRO_IOS_DEVICE overrides it
pick_simulator() {
	local udid='' want="${1:-1}"

	if [ -n "${MAESTRO_IOS_DEVICE:-}" ]; then
		printf '%s' "$MAESTRO_IOS_DEVICE"
		return 0
	fi

	# runtimes are listed oldest first, so the last iphones are on the newest one available
	udid="$(xcrun simctl list devices available | grep -E '^[[:space:]]+iPhone' \
		| grep -Eo '\([0-9A-Fa-f-]{36}\)' | tr -d '()' | tail -"$want" | paste -sd, - || true)"
	[ -n "$udid" ] || die "no available iphone simulator; create one in Xcode > Devices"
	printf '%s' "$udid"
}

boot_simulator() {
	local udid="$1" boot_log="$WORK_DIR/bootstatus-$udid.log" waited=0 boot_pid status=0
	log "booting simulator $udid (timeout ${BOOT_TIMEOUT}s)"
	mkdir -p "$WORK_DIR"

	# bounded AND chatty on purpose: bootstatus blocks with its output redirected, so a hung
	# boot used to burn a whole 74-minute ci job and emit nothing to explain it
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
		if [ $((waited % 20)) -eq 0 ]; then
			log "still booting $udid (${waited}s)"
		fi
	done
	wait "$boot_pid" || status=$?
	if [ "$status" -ne 0 ]; then
		warn "simulator boot failed; last lines of $boot_log:"
		tail -20 "$boot_log" >&2
		die "the simulator never reached a booted state"
	fi

	log "booted after $(grep -cE '^\[' "$boot_log" 2> /dev/null || echo '?') status polls"
	# the window server makes wkwebview rendering (and screenshots) behave
	open -a Simulator --args -CurrentDeviceUDID "$udid" > /dev/null 2>&1 || true
}

# #endregion

require_cmd xcrun 'install Xcode and its command line tools'
require_cmd bun
resolve_maestro

start_mocks "$mantle_port" "$cloud_port"

build_web "$DOTENV"
assert_bundle_host "$(url_authority "$api_url")"

log 'syncing the capacitor ios project'
bunx cap sync ios

# -destination beats -sdk here: the App target embeds Watch.app (@capgo/capacitor-watch)
# and -sdk iphonesimulator breaks a project with a watch target
log 'building App.app for the ios simulator'
xcodebuild \
	-project ios/App/App.xcodeproj \
	-scheme App \
	-configuration Debug \
	-destination 'generic/platform=iOS Simulator' \
	-derivedDataPath "$DERIVED" \
	-quiet \
	CODE_SIGNING_ALLOWED=NO \
	CODE_SIGNING_REQUIRED=NO \
	ONLY_ACTIVE_ARCH=YES \
	build

[ -d "$APP_PATH" ] || die "xcodebuild produced no app at $APP_PATH"

# more simulators is the only speedup that does not run fewer flows; each is its own isolated
# container, so they cannot race each other's Preferences
SHARDS="${MAESTRO_IOS_SHARDS:-1}"
UDIDS="$(pick_simulator "$SHARDS")"

for udid in ${UDIDS//,/ }; do
	boot_simulator "$udid"
	log "installing $APP_PATH on $udid"
	xcrun simctl install "$udid" "$APP_PATH"
done

run_flows "$UDIDS"

finish
