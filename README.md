# Sky - The Earth App Mobile Interface

> Mobile frontend for The Earth App powered by Nuxt, Ionic Vue, and Capacitor.

Sky is the mobile shell for The Earth App. It extends the shared frontend package from `@earth-app/crust` and adapts the experience for iOS, Android, and client-side development with a native-friendly tab layout, push notifications, deep links, offline state, and mobile settings.

## 🏗️ Architecture Overview

### Technology Stack

- **Framework**: Nuxt 4 with Vue 3
- **Mobile Shell**: Ionic Vue + Capacitor
- **State Management**: Pinia via `@pinia/nuxt`
- **Styling**: Tailwind CSS, `@nuxt/ui`, and Ionic CSS variables
- **Icons**: `@nuxt/icon` with Iconify sets
- **Internationalization**: `@nuxtjs/i18n`
- **Responsive Behavior**: `nuxt-viewport`
- **Shared Frontend Base**: `@earth-app/crust`
- **Shared Protocol/Types**: `@earth-app/ocean`
- **Native APIs**: Capacitor App, Browser, Camera, Filesystem, Geolocation, Haptics, Network, Preferences, Push Notifications, Share, Splash Screen, Toast, and related plugins

### Application Structure

```txt
src/
├── app.vue              # Mobile app bootstrap, auth/session restore, offline banner, deep links, push setup, welcome tour
├── app.config.ts        # App metadata (name, description, theme color)
├── error.vue            # Global error handling page
├── animations/          # Shared route animation helpers
├── assets/css/          # Global styling, theme tokens, and Ionic variables
├── components/          # Feature-based mobile UI components
├── composables/         # Network, auth, settings, deep link, push, and native helpers
├── pages/               # File-based routing for landing, auth, profile, and tabbed mobile views
└── server/              # Optional Nitro server routes used by the app

android/
├── app/                 # Capacitor Android project
└── gradle/              # Android Gradle wrapper and configuration

ios/
├── App/                 # Capacitor iOS project
└── Capacitor-cordova-ios-plugins/  # Native plugin support files

.github/
└── workflows/           # Build, format, and release automation
```

## 🚀 Key Features

### 1. **Mobile-First Shell**

Sky is designed around a persistent mobile tab bar and a centered create action. The primary shell lives in [`src/pages/tabs.vue`](src/pages/tabs.vue), which keeps navigation state stable while the user moves between dashboard, discover, quests, profile, and creation flows.

Notable shell behavior:

- Bottom tab navigation with a floating central FAB for create actions
- Custom slide animation for route transitions
- Profile tab routing that adapts to the current user
- Shell-level refresh signals for reselecting dashboard and discover tabs
- Native-friendly layout spacing and Ionic-safe area handling

### 2. **Upstream Frontend Extension**

Sky extends the shared Earth App frontend package rather than duplicating the entire product surface. That keeps mobile changes aligned with the main frontend architecture while allowing mobile-specific shell behavior.

Important implications:

- Shared frontend logic comes from `@earth-app/crust`
- Changes that affect shared routes or data contracts should stay compatible with the upstream package
- Mobile-only behavior should live in the Sky shell, composables, or native bridge layers when possible

### 3. **Authentication, Session Restore, and Mobile OAuth**

The app bootstraps auth in the client shell and keeps session state available across native launches.

Key pieces:

- Session state is restored on the client and mirrored into local storage
- Login/signup/link/unlink flows use `useMobileOAuth()` so native devices can open external auth windows correctly
- OAuth flows remember their in-progress state to survive app transitions
- The profile tab and welcome tour adapt to the current authenticated user

**Flow summary**:

1. App opens and restores any existing session token
2. Auth state hydrates through the shared store
3. Mobile OAuth opens browser windows on native platforms and external navigation on the web
4. Callback routes resolve back into the app shell

### 4. **Deep Linking and Push Notifications**

The root app coordinates mobile deep links and push actions so external events route into the correct view.

- `useDeepLinkRouting()` maps app and web URLs into internal mobile routes where appropriate
- External-only destinations are kept external for safety and UX correctness
- `initPushNotifications()` registers device tokens and routes notification taps to content or notification pages
- Browser and app listeners are wired in the app root for a consistent native launch experience

### 5. **Offline Mode and Network Awareness**

Sky has explicit network-awareness instead of assuming a continuous connection.

- `useNetwork()` tracks online/offline state and connection type
- App-level offline mode can be toggled independently of raw connectivity
- Data saver mode reduces fetch pressure and content payload size
- Downloaded content state is stored and mirrored so offline-capable pages can recover quickly

### 6. **Settings-Driven UI and Native Preferences**

The app supports user-controlled preferences for theme, scale, font, animation, thumbnails, push notifications, haptics, data saver, preload behavior, and offline mode.

- Preferences are persisted through Capacitor Preferences
- Document-level CSS variables are updated when settings change
- Theme and font choices are applied globally so the native shell stays consistent
- The settings page is a core part of the mobile experience, not a secondary detail screen

### 7. **Mobile Content Model**

Sky retains the Earth App’s content-oriented structure, but optimizes the experience for compact screens and touch interaction.

The main content areas are:

- Activities
- Articles
- Events
- Prompts
- Quests
- User profiles, badges, journeys, and notifications

Feature folders under [`src/components`](src/components) follow the same split:

- `activity/`
- `article/`
- `event/`
- `prompt/`
- `user/`

### 8. **Native Build and Deployment Workflow**

Sky ships as both a web app and native Capacitor builds.

- Android and iOS projects live in `android/` and `ios/`
- `generate:ios` and `generate:android` build the app output for each platform
- `build:ios` and `build:android` chain build, sync, and platform-specific native builds
- Capacitor settings control plugin behavior such as cookies, HTTP, push notifications, and splash screen display

### 9. **Developer Experience**

#### Code Quality

- Prettier is used as the primary formatting tool
- TypeScript is enabled throughout the app
- Bun is the package manager and script runner
- `husky` and `lint-staged` keep formatting checks in the commit path

#### Scripts

```json
{
	"dev": "bunx nuxi dev --dotenv .config/local.env --no-restart --public --port 3001",
	"dev:remote": "bunx nuxi dev --dotenv .config/production.env --dotenv .env --no-restart --public --port 3001",
	"generate": "nuxt build",
	"generate:ios": "nuxt build --dotenv .env.ios",
	"generate:android": "nuxt build --dotenv .env.android",
	"build:ios": "bun run generate:ios && bunx cap sync ios && bunx cap build ios",
	"build:android": "bun run generate:android && bunx cap sync android && bunx cap build android",
	"sync": "bunx cap sync",
	"prettier": "bunx prettier --write .",
	"prettier:check": "bunx prettier --check .",
	"postinstall": "nuxt prepare"
}
```

#### Environment Configuration

Sky uses runtime config and environment files for public values such as API endpoints and OAuth client IDs.

Common environment sources:

- `.env` for local public client IDs and public maps access
- `.env.ios` and `.env.android` for platform-specific build values
- `.config/local.env` for local development
- `.config/production.env` for remote production-like development

**Public runtime keys**:

```bash
NUXT_PUBLIC_SITE_URL=https://app.earth-app.com
NUXT_PUBLIC_API_BASE_URL=https://api.earth-app.com
NUXT_PUBLIC_CRUST_BASE_URL=https://app.earth-app.com
NUXT_PUBLIC_GOOGLE_CLIENT_ID=<public-client-id>
NUXT_PUBLIC_MICROSOFT_CLIENT_ID=<public-client-id>
NUXT_PUBLIC_GITHUB_CLIENT_ID=<public-client-id>
NUXT_PUBLIC_DISCORD_CLIENT_ID=<public-client-id>
NUXT_PUBLIC_FACEBOOK_CLIENT_ID=<public-client-id>
NUXT_PUBLIC_MAPS_API_KEY=<public-key>
```

## 📦 Dependencies

### Core Dependencies

- **`@earth-app/crust`**: Shared upstream frontend package
- **`@earth-app/ocean`**: Shared types and contracts
- **`nuxt`**: Application framework
- **`vue`**: UI runtime
- **`@ionic/vue`** and **`@ionic/vue-router`**: Mobile UI framework and routing
- **`@pinia/nuxt`**: Store integration
- **`@nuxt/ui`**: UI primitives and form components
- **`luxon`**: Date/time handling
- **`piexifjs`**: Image metadata handling

### Nuxt Modules

- **`@nuxtjs/ionic`**: Ionic integration
- **`@nuxt/image`**: Image handling
- **`@nuxtjs/i18n`**: Localization scaffolding
- **`nuxt-viewport`**: Viewport and device-aware behavior
- **`@nuxtjs/google-fonts`**: Font loading
- **`@nuxt/icon`**: Icon rendering

### Capacitor Plugins

- **App**: Native app lifecycle and URL listeners
- **Browser**: External auth and external-link handling
- **Camera**: Media capture
- **Filesystem**: Offline file storage and content caching
- **Geolocation**: Location-aware features
- **Haptics**: Native tactile feedback
- **Network**: Connectivity detection
- **Preferences**: Local preference persistence
- **Push Notifications**: Device push registration and interaction
- **Share**: Native share sheet integration
- **Splash Screen**: Launch screen control
- **Toast**: Native notification surfaces

### Icon Collections

Sky uses Iconify sets through `@nuxt/icon`. The package includes several icon collections in `devDependencies`, and the app uses a mix of Material Design, Logos, and related icon families across the mobile shell.

## 🚢 Deployment

### Web and Build Output

Sky is configured for a static Nuxt output with a client-side app shell and native build artifacts.

### Native Builds

- iOS build generation: `bun run generate:ios`
- Android build generation: `bun run generate:android`
- Capacitor sync: `bun run sync`
- Final native builds are produced with Capacitor CLI after Nuxt output generation

### CI Workflow

The repository includes GitHub Actions for build validation, formatting checks, and releases.

- `build.yml` runs iOS and Android generation jobs
- `prettier.yml` checks formatting on push and pull requests
- `release.yml` handles manual release publishing and changelog creation

## 🔐 Security Features

1. **Runtime Config Boundary**: Sensitive values stay out of client code and are loaded through runtime config or environment variables.
2. **Native Session Handling**: Session tokens are restored carefully and synced across app launches.
3. **External Auth Isolation**: OAuth and external navigation use browser windows or external routing when appropriate.
4. **Push Token Posting**: Push tokens are posted through authenticated API calls from the device.
5. **Native Permissions**: Capabilities such as push notifications and geolocation rely on explicit plugin permissions.

## 🧪 Development Workflow

### Local Development

```bash
# Install dependencies
bun install

# Start local dev server
bun run dev

# Start production-like dev server
bun run dev:remote

# Build iOS assets
bun run generate:ios

# Build Android assets
bun run generate:android

# Sync Capacitor
bun run sync

# Format code
bun run prettier

# Check formatting
bun run prettier:check
```

### Environment Setup

Local development uses runtime environment files rather than hard-coded values. Keep public OAuth IDs and maps keys in the local environment files referenced by the scripts, and avoid placing secrets in the checked-in source tree.

### Native Build Notes

- Keep Ionic bundle deduplication intact so native builds do not pick up duplicate component libraries.
- Keep `vite.build.cssCodeSplit = false` for consistent native styling.
- If a native screen looks unstyled or transitions behave oddly, validate the generated Nuxt output before debugging the Capacitor wrapper.

## 📚 App Integration Guide

### External Services

#### OAuth Providers

- Google
- Microsoft
- GitHub
- Discord
- Facebook

These providers are driven by public client IDs in runtime config and used by the mobile OAuth flow.

#### Maps

- `NUXT_PUBLIC_MAPS_API_KEY` is used for map and location-related features.

### Backend Services

Sky works with the Earth App API and the upstream shared frontend contracts.

- API base URL is configured through runtime config
- Shared frontend behavior comes from `@earth-app/crust`
- Backend contract changes should be kept aligned with shared types and validators

### Mobile Services

- Push notification registration
- Offline downloads and cache mirroring
- Native haptics
- Native share sheet
- Capacitor browser-based auth flows

## 🎨 UI/UX Patterns

### Responsive Design

- Mobile-first layout with Ionic tab navigation
- Viewport-aware behavior through `nuxt-viewport`
- Compact controls that favor touch targets and safe areas

### Animation System

- Shared slide transition for route changes
- Welcome tour overlays in the app root
- Theme and state transitions are intentionally subtle and native-friendly

### Loading States

- Use skeletons and placeholders for slow content areas
- Keep shell-level navigation responsive even while data is loading
- Avoid blocking the tab shell on content fetches unless a route truly requires it

### Forms & Validation

- Use typed forms and shared validation patterns when a screen accepts user input
- Prefer reusable feature components over one-off form logic
- Keep validation aligned with the shared Earth App contracts

## 🗂️ State Management

- Pinia manages shared auth and application state
- `useState()` is used for shell signals and cross-route UI coordination
- Settings are persisted through Capacitor Preferences and reapplied on launch
- Offline/downloaded state is kept separate from online session state

## 📊 Performance Optimizations

1. **Single Stylesheet for Native Builds**: CSS code splitting is disabled so mobile builds keep styling consistent.
2. **Dependency Deduplication**: Ionic packages are deduped in Vite to avoid duplicate runtime bundles.
3. **Local Session Restore**: Session tokens are restored from local storage before the app performs heavier auth hydration.
4. **Data Saver Controls**: Network-sensitive paths reduce payload size and delay work when needed.
5. **Native-First Navigation**: Tabs and route transitions are optimized for mobile interaction patterns.

## 🛠️ Troubleshooting

### Common Issues

**Issue**: OAuth does not return to the app on mobile
**Solution**: Check the mobile OAuth flow, deep-link routing, and the Capacitor browser/app listeners.

**Issue**: Push notifications do not register
**Solution**: Confirm native permissions, plugin configuration, and the authenticated API endpoint used to save the token.

**Issue**: The app shows as offline unexpectedly
**Solution**: Check `useNetwork()` state and any app-level offline toggle in settings.

**Issue**: Native builds look partially unstyled
**Solution**: Verify Ionic version deduplication and keep CSS code splitting disabled.

**Issue**: TypeScript errors after dependency changes
**Solution**: Run `bun run postinstall` to regenerate Nuxt types, then re-run `bunx vue-tsc --noEmit`.

## 📝 Contributing Guidelines

1. **Code Style**: Use Prettier and keep formatting consistent.
2. **Type Safety**: Keep new code fully typed.
3. **Native Awareness**: Consider both browser and Capacitor behavior when editing shared shell code.
4. **Testing**: Validate touched routes and native flows manually when the change affects user-facing behavior.
5. **Documentation**: Update this README when the shell, scripts, or deployment workflow change.

## 🔗 Backend Repositories

- `earth-app/crust` - Shared frontend base that Sky extends
- `earth-app/mantle2` - Core API and business-logic backend
- `earth-app/cloud` - Cloudflare/edge services and worker-side integrations

When API shapes, route behavior, or shared contracts change, update the relevant backend repository and any shared types that Sky consumes.

## 📄 License

See the [LICENSE](LICENSE) file for details.

## 🤝 Credits

- **Framework**: [Nuxt](https://nuxt.com/)
- **Mobile Shell**: [Ionic Vue](https://ionicframework.com/docs/vue)
- **Native Bridge**: [Capacitor](https://capacitorjs.com/)
- **UI Components**: [@nuxt/ui](https://ui.nuxt.com/)
- **Icons**: [Iconify](https://iconify.design/)
- **Shared Frontend Base**: [earth-app/crust](https://github.com/earth-app/crust)
- **Developed by**: [Gregory Mitchell](https://github.com/gmitch215)

---

For questions or support, open an issue on GitHub or contact the development team.
