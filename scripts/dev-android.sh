#!/bin/bash
set -euo pipefail

echo "🍦 Starting production-like development for Android"
echo "🧱 Building Nuxt static assets with Android environment..."
bun run generate:android

echo "🔃 Syncing Capacitor Android project with fresh web assets..."
bunx ionic capacitor sync android --no-build

echo "🏃 Select an Android emulator/device to run the app bundle..."
bunx ionic capacitor run android --mode development --no-build
