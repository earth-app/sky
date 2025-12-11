LIP=$(ipconfig getifaddr en0)

echo "🍦 Starting local development to android device - ensure local dev server is running already"
echo "🏗️ Type checking and building for development..."
bunx run build:dev
echo "🔃 Capacitor installation, podfile installation, sync and copy to app distribution folders..."
bunx ionic capacitor sync android --no-build
echo "🏃 Select an Android device to run the build at local ip address ${LIP} on..."
eval "bunx ionic capacitor run android --livereload-url=http://${LIP}:3001  --external --mode development"
