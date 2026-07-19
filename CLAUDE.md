# Project Context: Sky (The Earth App Mobile Interface)

This file gives Claude project-specific context for working on Sky. Keep it current, concise, and free of secrets. Sky is the mobile frontend for The Earth App and extends the shared frontend package from `@earth-app/crust`.

## About This Project

Sky is a Nuxt 4, Ionic Vue, and Capacitor application that serves as the mobile interface for The Earth App. It is designed for native iOS and Android builds, plus a client-side web development loop for fast iteration.

Key goals when changing this repo:

- Preserve compatibility with the upstream `@earth-app/crust` frontend package.
- Keep the mobile shell stable: tab navigation, deep linking, OAuth, push notifications, and native plugins are shared concerns.
- Prefer small, typed changes that work in both browser and Capacitor environments.
- Keep public runtime config free of secrets. Public keys are fine; private values belong in environment files or deployment secrets.

## Quick Map (Key Files & Folders)

- `src/` - Application source for the mobile shell, pages, components, composables, animations, and styles.
- `src/app.vue` - App root that wires global shell behavior, offline banner, deep-link handling, push setup, and the welcome tour.
- `src/pages/tabs.vue` - Persistent tab shell with the bottom tab bar and floating create action.
- `src/pages/` - Route pages for login, signup, email verification, profile, and the tabbed mobile experience.
- `src/components/` - Mobile UI components, including feature folders for activity, article, event, prompt, and user flows.
- `src/composables/` - Mobile-specific state and platform helpers for network, auth, deep links, settings, haptics, notifications, and persistence.
- `src/animations/slide.ts` - Shared router animation used for mobile transitions.
- `src/assets/css/main.css` - Global styling, theme tokens, typography, and Ionic color variables.
- `nuxt.config.ts` - Primary Nuxt config, runtime config, module list, Vite options, and dependency dedupe rules.
- `capacitor.config.ts` - Capacitor app identity, native plugin configuration, and splash/native shell settings.
- `package.json` - Scripts, dependencies, overrides, and release/build workflow entry points.
- `.github/workflows/` - CI for builds, formatting checks, and releases.
- `.env` - Local public runtime values for OAuth client IDs and Maps API access.

## Notable Modules & Runtime Configuration

- Sky extends `@earth-app/crust` in [`nuxt.config.ts`](nuxt.config.ts).
- The app is client-rendered (`ssr: false`) and uses a static Nitro preset.
- Tailwind is integrated through `@tailwindcss/vite`.
- Ionic is configured through `@nuxtjs/ionic` with tab-bar and native-friendly styling enabled.
- `@pinia/nuxt` provides store integration.
- `@nuxtjs/i18n` is present with English as the current locale.
- `nuxt-viewport` is available for device-aware behavior.
- `@nuxt/icon` is used for Iconify-based icons.
- `@nuxtjs/google-fonts` loads the project font families.
- `vite.resolve.dedupe` includes `@ionic/core`, `@ionic/vue`, and `@ionic/vue-router` to avoid duplicate Ionic bundles on native builds.
- `vite.build.cssCodeSplit = false` is intentional so Capacitor builds ship one consistent stylesheet.
- `runtimeConfig.public` exposes mobile-facing values such as `baseUrl`, `apiBaseUrl`, `crustBaseUrl`, OAuth client IDs, and `mapsApiKey`.
- `nitro.routeRules` currently apply permissive CORS and a no-referrer policy globally.

## Architecture Notes

- Sky is a mobile shell around the Earth App experience, not a separate product line.
- The root app handles app-level concerns like offline status, auth hydration, push notification setup, deep-link routing, and user settings application.
- Tabs are the primary interaction model. `src/pages/tabs.vue` holds the persistent navigation shell and the floating create menu.
- The welcome tour is implemented in `src/app.vue` using `MSiteTour` and client-only rendering.
- Mobile navigation is expected to be stateful and reactive across tab switches, not reloaded from scratch on every route change.
- The project relies heavily on `useState()` for cross-route shell state such as refresh signals, settings, and auth-derived UI.
- Native behavior is coordinated through Capacitor plugins rather than browser-only assumptions.

## Mobile Shell Behavior

- `src/app.vue` registers Ionic PWA custom elements on the client and applies the global slide animation.
- The offline banner is driven by `useNetwork()` and `isOffline`.
- App settings are initialized through `useAppSettings()` and applied to the document root, including theme, font, scale, and animation toggles.
- Auth state is restored from local storage into the Pinia auth store on the client so native launches can resume session state.
- Deep links are resolved through `useDeepLinkRouting()`.
- Mobile OAuth flows are managed by `useMobileOAuth()` so the app can open browser windows on native and use external navigation on the web.
- Push notification registration is handled by `initPushNotifications()` and posts the device token back to the API.

## Key Composables

- `useNetwork()` tracks online/offline state, connection type, data saver, and downloaded content state.
- `useSettings()` and `useAppSettings()` persist app preferences through Capacitor Preferences and mirror them onto the document.
- `useMobileOAuth()` coordinates login, signup, link, and unlink flows, with browser-window handling for native devices.
- `useDeepLinkRouting()` normalizes external URLs into internal mobile routes where appropriate.
- `usePushNotifications()` registers native push notifications and routes notification actions to content or notification detail pages.
- `useHaptics()` is the app’s user-feedback layer for mobile interactions.
- `useOfflineAuth()` supports auth validation while offline for downloaded content and limited interactions.
- `useServer()` is the primary request layer for backend calls.
- `usePreferences()` persists user-facing toggles and cached UI decisions.

## Route Map

- `src/pages/index.vue` - Landing page and top-level entry.
- `src/pages/login.vue` - Sign-in flow.
- `src/pages/signup.vue` - Account creation.
- `src/pages/verify-email.vue` - Email verification.
- `src/pages/profile/` - Profile views and editor screens.
- `src/pages/tabs/dashboard.vue` - Main personalized dashboard.
- `src/pages/tabs/discover.vue` - Discovery/search page for activities, articles, prompts, and related content.
- `src/pages/tabs/quests/` - Quest browsing and detail flow.
- `src/pages/tabs/articles/` - Article detail and article creation flow.
- `src/pages/tabs/events/` - Event detail and event creation flow.
- `src/pages/tabs/prompts/` - Prompt detail and prompt creation flow.
- `src/pages/tabs/profile/` - Profile detail, editor, notifications, and journey leaderboard routes.
- `src/pages/tabs/settings.vue` - App settings and native toggles.
- `src/pages/tabs/downloads.vue` - Offline downloads and cached content management.
- `src/pages/tabs/upgrade.vue` - Upgrade / monetization surface if enabled.

## Components & Feature Areas

- `src/components/activity/` - Activity cards, selectors, and profile surfaces.
- `src/components/article/` - Article cards, editor, forms, quizzes, and page shells.
- `src/components/event/` - Event cards, forms, location inputs, thumbnail editing, and submission assets.
- `src/components/prompt/` - Prompt cards, create menus, pages, and response UI.
- `src/components/user/` - Login/signup forms, profile screens, badges, notifications, journeys, and quest steps.
- `src/components/Back.vue` and `src/components/Share.vue` are shared shell helpers.
- `src/components/MSiteTour.vue` is the onboarding tour component used from the app root.
- `src/components/MInfoCard*.vue` and `src/components/MRanks.vue` are shared mobile presentation primitives.

## Styling & UX Conventions

- Global colors and font families live in [`src/assets/css/main.css`](src/assets/css/main.css).
- CSS variables are defined on `:root`, `html`, `body`, and `ion-app` so native and web shells stay in sync.
- The app uses a custom Earth palette rather than default Ionic tones.
- `light` and `dark` classes are used for theme-specific values.
- Keep Ion/utility classes consistent with the existing mobile shell instead of introducing desktop-first layouts.
- When adding new app-level styles, ensure they work inside Ionic shadow DOM and the tab shell.
- Section comments use `// #region <name>` ... `// #endregion` markers (editor-foldable, matches the mantle2/PHP style), NOT dashed dividers like `// ----- x`.

## Backend Integration

- The frontend depends on the shared Earth App backend and the upstream `@earth-app/crust` package.
- Treat `earth-app/crust` as the canonical shared frontend baseline.
- Treat `earth-app/mantle2` as the core API and business-logic backend.
- Treat `earth-app/cloud` as the Cloudflare/edge backend when a change crosses into worker-side behavior.
- If a mobile UI change depends on a new API shape, update the upstream contract first or confirm that the existing shared types already cover it.
- Avoid changing request or response shapes in isolation; mobile and shared frontend code should agree on the contract.

### Request routing rule (mantle2-direct vs crust Nitro-proxy)

- **mantle2 (`/v2/*`) is called DIRECT** from the shared crust stores/composables via `makeAPIRequest` / `makeClientAPIRequest` + `useAuthStore().sessionToken`. `apiBaseUrl` is absolute, so those calls work on native with no extra hop. Sky reuses such a composable verbatim (`useTrails()`, `useTrailmarks()`, `useCircles()`) — do NOT fork it, and do NOT pass `makeMServerRequest` into it.
- **`makeMServerRequest` (`useServer.ts`) is ONLY for reaching a crust `src/server/api/*` Nitro route** that proxies to cloud with a server-side secret (admin key or another API key). Sky injects it into the composables that take a `serverRequest = makeServerRequest` param for exactly those cloud/secret calls (e.g. `useActivityInfo(makeMServerRequest)`).
- A composable that only hits mantle2 has no `serverRequest` param — if you find yourself writing a sky-only `useM*` copy just to swap in `makeMServerRequest`, the underlying store is wrongly routing a mantle2 call through a Nitro proxy; fix the store to call mantle2 directly instead. (This is why `useMCircles` was deleted.)

## CI, Build, and Release

- CI workflows live in `.github/workflows/`.
- `build.yml` runs the iOS and Android build generation flows.
- `prettier.yml` checks formatting.
- `release.yml` handles manual release publishing with changelog generation.
- Native build generation uses the `generate:ios` and `generate:android` scripts before Capacitor sync/build steps.
- The build jobs use Bun and require GitHub Packages access for the scoped `@earth-app/*` packages.

## How to Run (Local Developer Commands)

- Install dependencies: `bun install`
- Start local dev server: `bun run dev`
- Start the production-like dev server: `bun run dev:remote`
- Build for iOS: `bun run build:ios`
- Build for Android: `bun run build:android`
- Sync Capacitor: `bun run sync`
- Regenerate Capacitor assets: `bun run sync:assets`
- Format the codebase: `bun run prettier`
- Check formatting: `bun run prettier:check`
- Regenerate Nuxt types: `bun run postinstall`

## Standard Workflows (for Claude)

When asked to change code:

1. Explore the relevant shell area first. Read the nearest page, composable, component, and configuration files before editing.
2. Check whether the change affects native behavior, auth, deep links, offline mode, push notifications, or the tab shell.
3. Plan a minimal edit that preserves mobile navigation and any existing upstream contracts.
4. Make the smallest typed change that solves the issue.
5. Validate with the cheapest useful check, usually a targeted typecheck or formatting pass for the touched slice.
6. If the change touches a mobile-native concern, verify both the web and Capacitor implications before widening scope.

For cross-cutting tasks:

- Use a subagent for broad read-only exploration if the relevant surface spans multiple folders.
- Prefer a quick, local hypothesis over broad repository mapping.
- If the task is about current behavior, investigate before editing.
- If the task is about a new feature or workflow, write down the route, state, and native behavior that could be affected.

## Common Commands & Checks

- Typecheck: `bunx vue-tsc --noEmit`
- Format check: `bun run prettier:check`
- Format code: `bun run prettier`
- Mobile build prep: `bun run generate:ios` or `bun run generate:android`
- Capacitor sync: `bun run sync`

## Notes & Cautions

- Do not commit secrets, access tokens, or private credentials to the repo.
- The checked-in `.env` contains public runtime values only. Treat it as configuration, not a secret store.
- Keep `src/app.vue` and `src/pages/tabs.vue` stable; they are the highest-impact shell files.
- Be careful when editing `capacitor.config.ts`; plugin settings affect native runtime behavior.
- Keep `vite.resolve.dedupe` and `vite.build.cssCodeSplit = false` unless there is a strong reason to change them.
- Native flows should respect browser differences. If a link must leave the app, use external navigation explicitly.
- If a feature changes auth hydration or session handling, check how it behaves on cold app launch, after deep links, and after returning from OAuth.

## Where to Find Things

- Mobile shell and global bootstrapping: `src/app.vue`
- Tab navigation and create FAB: `src/pages/tabs.vue`
- Route screens: `src/pages/`
- Shared UI building blocks: `src/components/`
- Native and app settings logic: `src/composables/`
- Global colors and typography: `src/assets/css/main.css`
- Build and runtime config: `nuxt.config.ts`
- Native bridge config: `capacitor.config.ts`
- Scripts and dependency graph: `package.json`
- Release and build automation: `.github/workflows/`

## Example: When Adding a New Tab-Shell Feature

1. Decide whether the feature belongs in `src/app.vue`, `src/pages/tabs.vue`, or a child route.
2. Add or update a composable in `src/composables/` if the state must survive route changes.
3. Keep Ionic navigation conventions intact so the tab bar and transitions still work natively.
4. If the feature touches auth, deep links, push, or offline support, update the shared bootstrap flow in `src/app.vue`.
5. Validate with targeted typecheck and a quick run through the relevant native/web flow.

## Example: When Changing a Settings Toggle

1. Update the settings model in `src/composables/useSettings.ts` or the related app-settings helper.
2. Apply the setting to the document or native shell if it affects theme, typography, scaling, or motion.
3. Confirm the setting persists through a restart and remains consistent in Capacitor.
4. Check for regressions in the app root and the tab pages that consume the setting.
