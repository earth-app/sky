#!/bin/bash
echo "🍦 Starting local development to ios device"
echo "🔃 Capacitor installation, podfile installation, sync and copy to app distribution folders..."
bunx ionic capacitor sync ios --no-build
echo "🏃 Select an iOS device to run the build..."
eval "bunx ionic capacitor run ios --external --mode development --no-build"
