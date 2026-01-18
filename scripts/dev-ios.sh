#!/bin/bash
LIP=$(ipconfig getifaddr en0)

echo "🍦 Starting local development to ios device - ensure local dev server is running already"
echo "🏗️ Type checking and building for development..."
bun run generate:ios
echo "🔃 Capacitor installation, podfile installation, sync and copy to app distribution folders..."
bunx ionic capacitor sync ios --no-build
echo "🏃 Select an iOS device to run the build at local ip address ${LIP} on..."
eval "bunx ionic capacitor run ios --livereload-url=http://${LIP}:3001 --external --mode development --no-build"
