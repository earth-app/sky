#!/bin/bash
set -euo pipefail

echo "🍦 Starting production-like development for iOS"
echo "🧱 Building Nuxt static assets with iOS environment..."
bun run generate:ios

echo "🔃 Syncing Capacitor iOS project with fresh web assets..."
bunx ionic capacitor sync ios --no-build

echo "🏃 Select an iOS simulator/device to run the app bundle..."
bunx ionic capacitor run ios --mode development --no-build
