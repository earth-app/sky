/**
 * Playwright configuration for the Sky E2E test suite.
 *
 * Two "modes":
 *   - Default (mocked): Mock backends boot via globalSetup; Playwright's
 *                       webServer starts the Nuxt dev/static server with mocked
 *                       env. Fast and CI-friendly. Used by build.yml's `test` job.
 *   - Integration:      MOCK_DISABLED=1 to skip the mock servers - tests assume
 *                       real mantle2 (8787) + cloud (9898) are already running.
 *                       Used by e2e.yml.
 *
 * Sky is `nitro.preset = 'static'` (an SSR-disabled SPA). In prod mode we
 * `bun run generate` to emit `dist/` then serve it with the dependency-free
 * static server in tests/e2e/utils/static-server.ts (SPA fallback to 200.html).
 * Dev mode runs the normal Nuxt dev server on port 3001.
 *
 * Coverage:
 *   When COVERAGE=1, the page fixture starts V8 JS coverage on chromium and
 *   the global teardown merges raw traces into coverage/lcov.info + summary
 *   for codecov upload.
 *
 * The `webkit` (iPhone) project runs the same non-mobile specs on WebKit, the
 * closest engine to the iOS WKWebView the app actually ships in, so WKWebView-class
 * bugs (head/unhead resolution, transport quirks) surface in CI. It is opt-in: the
 * default test:e2e selects chromium projects explicitly; use test:e2e:webkit to run it.
 */

import type { ConfigOptions } from '@nuxt/test-utils/playwright';
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('.', import.meta.url));
const isCI = !!process.env.CI;
const coverage = process.env.COVERAGE === '1';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3001';
const prodServer = process.env.PLAYWRIGHT_PROD === '1';

const chromiumArgs = [
	'--disable-background-timer-throttling',
	'--disable-backgrounding-occluded-windows',
	'--disable-renderer-backgrounding'
];

const reporters: any[] = [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]];

if (isCI) {
	reporters.push(['github']);
	reporters.push(['junit', { outputFile: 'playwright-report/junit.xml' }]);
}

export default defineConfig<ConfigOptions>({
	testDir: './tests/e2e',
	testIgnore: ['**/utils/**'],
	fullyParallel: true,
	forbidOnly: isCI,
	retries: isCI ? 2 : 3,
	workers: prodServer ? 4 : coverage ? 2 : isCI ? 2 : undefined,
	timeout: 120_000,
	expect: {
		timeout: 12_000
	},
	globalSetup: fileURLToPath(new URL('./tests/e2e/utils/global-setup.ts', import.meta.url)),
	globalTeardown: fileURLToPath(new URL('./tests/e2e/utils/global-teardown.ts', import.meta.url)),
	reporter: reporters,
	// Keep test artifacts OUT of the HTML reporter folder. The HTML reporter
	// clears its output dir before generating the report, which would wipe out
	// failure screenshots / traces and produce a CI warning. Two distinct dirs.
	outputDir: 'playwright-results',
	webServer: {
		command: prodServer
			? 'test -d dist || bun run build:test && bun run serve:test'
			: 'bun run dev:test',
		url: BASE_URL,
		reuseExistingServer: !isCI,
		timeout: prodServer ? 360_000 : 240_000,
		stdout: 'pipe',
		stderr: 'pipe'
	},
	use: {
		baseURL: BASE_URL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		actionTimeout: 12_000,
		navigationTimeout: prodServer ? 30_000 : 90_000,
		nuxt: {
			rootDir: PROJECT_ROOT,
			host: BASE_URL + '/'
		}
	},
	projects: [
		{
			name: 'chromium',
			// mobile/responsive specs belong to the Pixel 7 project
			testIgnore: /\.(mobile|responsive)\.spec\.ts$/,
			use: { ...devices['Desktop Chrome'], launchOptions: { args: chromiumArgs } }
		},
		{
			// Android System WebView + Android Chrome both run Chromium (Blink)
			name: 'mobile-chromium',
			testMatch: /\.(mobile|responsive)\.spec\.ts$/,
			use: { ...devices['Pixel 7'], launchOptions: { args: chromiumArgs } }
		},
		{
			// closest engine to the shipped iOS WKWebView; opt-in via test:e2e:webkit.
			// mobile/native specs stay chromium-only (they lean on chromium launch args)
			name: 'webkit',
			testIgnore: /\.(mobile|responsive)\.spec\.ts$/,
			use: { ...devices['iPhone 14'] }
		}
	]
});
