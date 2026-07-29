#!/usr/bin/env bash
# builds sky for the ios simulator against the mock backends and runs the maestro flows

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/maestro-common.sh"

PLATFORM='ios'
REPRODUCE='bun run maestro:ios'

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
	local udid="$1"
	log "booting simulator $udid"
	xcrun simctl bootstatus "$udid" -b
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
