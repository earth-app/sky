echo "🍦 Starting local development to android device"
echo "🔃 Capacitor installation, podfile installation, sync and copy to app distribution folders..."
bunx ionic capacitor sync android --no-build
echo "🏃 Select an Android device to run the build..."
eval "bunx ionic capacitor run android --external --mode development --no-build"
