#!/usr/bin/env bash
# builds sky for an android emulator against the mock backends and runs the maestro flows

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/maestro-common.sh"

PLATFORM='android'
REPRODUCE='bun run maestro:android'

DOTENV="$ROOT/.config/maestro-android.env"
APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"

# the emulator reaches the host loopback at 10.0.2.2, which is why this dotenv is
# not the ios one
api_url="$(dotenv_value "$DOTENV" NUXT_PUBLIC_API_BASE_URL)"
cloud_url="$(dotenv_value "$DOTENV" NUXT_PUBLIC_CLOUD_BASE_URL)"
# via variables, so a malformed url fails the assignment instead of passing an empty arg
mantle_port="$(url_port "$api_url")"
cloud_port="$(url_port "$cloud_url")"

# #region sdk

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
	[ -n "$sdk" ] && [ -d "$sdk" ] || die 'android sdk not found; set ANDROID_HOME'
	export ANDROID_HOME="$sdk"
	export ANDROID_SDK_ROOT="$sdk"
	ADB="$sdk/platform-tools/adb"
	EMULATOR="$sdk/emulator/emulator"
	[ -x "$ADB" ] || die "no adb at $ADB"
}

# #endregion

# #region device

connected_serial() {
	"$ADB" devices | awk '$2 == "device" { print $1; exit }'
}

# sets SERIAL and STARTED_EMULATOR rather than echoing, so the caller keeps both
boot_emulator() {
	local avd="${MAESTRO_AVD:-}" tries=0
	[ -x "$EMULATOR" ] || die "no emulator binary at $EMULATOR"
	if [ -z "$avd" ]; then
		avd="$("$EMULATOR" -list-avds | head -1 || true)"
	fi
	[ -n "$avd" ] || die 'no avd available; create one with avdmanager, or set MAESTRO_AVD'

	log "booting emulator $avd"
	mkdir -p "$WORK_DIR"
	nohup "$EMULATOR" -avd "$avd" -no-snapshot-save -no-boot-anim -netdelay none -netspeed full \
		>"$WORK_DIR/emulator.log" 2>&1 &
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
		if [ "$("$ADB" -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = '1' ]; then
			return 0
		fi
		tries=$((tries + 1))
		sleep 2
	done
	die "the emulator booted but never reported sys.boot_completed; see $WORK_DIR/emulator.log"
}

# #endregion

STARTED_EMULATOR=0

require_cmd bun
resolve_sdk
resolve_maestro

start_mocks "$mantle_port" "$cloud_port"

build_web "$DOTENV"
assert_bundle_host "$(url_authority "$api_url")"

log 'syncing the capacitor android project'
bunx cap sync android

log 'assembling the debug apk'
(cd "$ROOT/android" && ./gradlew --console=plain assembleDebug)

[ -f "$APK" ] || die "gradle produced no apk at $APK"

# ci hands us a booted emulator (reactivecircus/android-emulator-runner), so only
# boot one when nothing is attached
SERIAL="$(connected_serial)"
if [ -z "$SERIAL" ]; then
	boot_emulator
fi
log "using device $SERIAL"

log "installing $APK"
"$ADB" -s "$SERIAL" install -r "$APK"

run_flows "$SERIAL"

if [ "$STARTED_EMULATOR" = '1' ]; then
	log "emulator $SERIAL left running; stop it with: $ADB -s $SERIAL emu kill"
fi

finish
