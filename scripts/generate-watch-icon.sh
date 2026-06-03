#!/usr/bin/env bash
# Generates the watchOS AppIcon for the Watch target from the shared resources/
# source. watchOS 10+ catalogs accept a single 1024x1024 universal image and the
# system handles every device-specific size at runtime, so we don't need to emit
# the legacy per-size matrix the way iOS 17 and earlier did.
#
# Sources:
#   resources/icon-watch.png  (optional - artwork tuned for the small canvas)
#   resources/icon.png        (required - fallback when icon-watch.png is absent)
#
# Output:
#   ios/App/Watch/Assets.xcassets/AppIcon.appiconset/AppIcon.png
#   ios/App/Watch/Assets.xcassets/AppIcon.appiconset/Contents.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RESOURCES_DIR="$REPO_ROOT/resources"
DEST_DIR="$REPO_ROOT/ios/App/Watch/Assets.xcassets/AppIcon.appiconset"

WATCH_SOURCE="$RESOURCES_DIR/icon-watch.png"
FALLBACK_SOURCE="$RESOURCES_DIR/icon.png"
# Watch icons are circular masks on a colored background — keep the same brand
# wash as the iOS light variant so the two icons look like the same product.
WATCH_BACKGROUND="${WATCH_ICON_BACKGROUND:-#174f96}"

if ! command -v magick >/dev/null 2>&1; then
	echo "error: ImageMagick 7 (\`magick\`) is required - install with \`brew install imagemagick\`" >&2
	exit 1
fi

[[ -f "$WATCH_SOURCE" ]] || WATCH_SOURCE="$FALLBACK_SOURCE"

if [[ ! -f "$WATCH_SOURCE" ]]; then
	echo "error: source icon not found at $WATCH_SOURCE" >&2
	exit 1
fi

mkdir -p "$DEST_DIR"

# watchOS renders icons inside a circular mask, so we composite over an opaque
# square background. The PNG itself stays a 1024x1024 square per Apple's spec;
# the system handles the circular crop and any device-specific resize.
magick "$WATCH_SOURCE" \
	-resize 1024x1024 \
	-background "$WATCH_BACKGROUND" -alpha remove -alpha off \
	"$DEST_DIR/AppIcon.png"

cat >"$DEST_DIR/Contents.json" <<'JSON'
{
	"images": [
		{
			"filename": "AppIcon.png",
			"idiom": "universal",
			"platform": "watchos",
			"size": "1024x1024"
		}
	],
	"info": {
		"author": "xcode",
		"version": 1
	}
}
JSON

echo "watchOS AppIcon written to $DEST_DIR"
