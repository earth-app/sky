import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	checkHardBudgets,
	collectDeviceShots,
	DEVICE_SHOT_DIR,
	formatDeviceTable,
	formatTable,
	measureDeviceShots,
	REPORT_FILE,
	writeDeviceReport,
	type DeviceEvalReport,
	type VisualEvalReport
} from '../tests/e2e/utils/visual-eval';

/**
 * Runs the visual-quality gate and prints the measured table.
 *
 * Two input modes, one set of metrics:
 *
 *   1. Default - a real browser at phone width. This drives the existing
 *      Playwright harness rather than reimplementing the boot: the mock backends
 *      come up in globalSetup and the static `dist/` bundle is served by
 *      tests/e2e/utils/static-server.ts.
 *   2. `--device-dir[=path]` - PNGs captured on a real simulator/emulator by
 *      maestro's `eval`-tagged flows (`bun run maestro:eval`). Same pixel kernel,
 *      better inputs; the complexity budget is skipped because a PNG has no DOM.
 *
 * `ssr: false` bakes the API base URLs at BUILD time, so the ports here MUST
 * match the ones the bundle was built with. The defaults mirror `test:e2e`
 * (a `build:e2e` bundle: mantle 8788, cloud 9899, app 3002); override them in
 * the environment to point at a `build:test` bundle (8787 / 9898 / 3001).
 */

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = 'tests/e2e/visual-eval.mobile.spec.ts';
const DEVICE_FLAG = '--device-dir';

// #region device-frame lane

const argv = process.argv.slice(2);
const passthrough: string[] = [];
let deviceDir = process.env.VISUAL_EVAL_DEVICE_DIR ?? null;

for (let i = 0; i < argv.length; i++) {
	const arg = argv[i]!;
	if (arg === DEVICE_FLAG) {
		const next = argv[i + 1];
		deviceDir = next && !next.startsWith('-') ? argv[++i]! : DEVICE_SHOT_DIR;
		continue;
	}
	if (arg.startsWith(`${DEVICE_FLAG}=`)) {
		deviceDir = arg.slice(DEVICE_FLAG.length + 1) || DEVICE_SHOT_DIR;
		continue;
	}
	passthrough.push(arg);
}

if (deviceDir) {
	const dir = resolve(deviceDir);
	const shots = collectDeviceShots(dir);
	if (shots.length === 0) {
		console.error(
			`[visual-eval] no PNGs under ${dir}\n` +
				`  capture some first: bun run maestro:eval   # eval-tagged flows takeScreenshot into ${DEVICE_SHOT_DIR}`
		);
		process.exit(1);
	}

	console.log(`[visual-eval] scoring ${shots.length} device frame(s) from ${dir}`);

	// the pixel kernel needs a canvas to decode the png, so borrow a headless browser
	const browser = await chromium.launch();
	let table = '';
	let reportFile = '';
	let breaches: ReturnType<typeof checkHardBudgets> = [];
	try {
		const context = await browser.newContext();
		const frames = await measureDeviceShots(context, dir);
		reportFile = writeDeviceReport(dir, frames);
		const report = JSON.parse(readFileSync(reportFile, 'utf-8')) as DeviceEvalReport;
		table = formatDeviceTable(report);
		breaches = checkHardBudgets(frames);
	} finally {
		await browser.close();
	}

	console.log(`\n${table}`);
	console.log(`\nreport: ${reportFile}`);
	if (breaches.length > 0) {
		console.error(`\n[visual-eval] ${breaches.length} budget breach(es):`);
		for (const breach of breaches) {
			console.error(`  ${breach.screen}: ${breach.budget} - ${breach.detail}`);
		}
		process.exit(1);
	}
	console.log('[visual-eval] hero + chroma budgets met on every frame');
	process.exit(0);
}

// #endregion

const SKY_PORT = process.env.SKY_PORT ?? '3002';
const MANTLE_PORT = process.env.MOCK_MANTLE_PORT ?? '8788';
const CLOUD_PORT = process.env.MOCK_CLOUD_PORT ?? '9899';

const env: Record<string, string> = {
	...(process.env as Record<string, string>),
	SKY_PORT,
	MOCK_MANTLE_PORT: MANTLE_PORT,
	MOCK_CLOUD_PORT: CLOUD_PORT,
	NUXT_PUBLIC_API_BASE_URL:
		process.env.NUXT_PUBLIC_API_BASE_URL ?? `http://127.0.0.1:${MANTLE_PORT}`,
	NUXT_PUBLIC_CRUST_BASE_URL:
		process.env.NUXT_PUBLIC_CRUST_BASE_URL ?? `http://127.0.0.1:${MANTLE_PORT}`,
	NUXT_PUBLIC_CLOUD_BASE_URL:
		process.env.NUXT_PUBLIC_CLOUD_BASE_URL ?? `http://127.0.0.1:${CLOUD_PORT}`,
	PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${SKY_PORT}`,
	PLAYWRIGHT_PROD: '1',
	// the table is printed here, from the json, so the spec stays quiet
	VISUAL_EVAL_QUIET: '1'
};

console.log(
	`[visual-eval] app ${env.PLAYWRIGHT_BASE_URL}, mantle ${MANTLE_PORT}, cloud ${CLOUD_PORT}`
);

// `ssr: false` bakes the base urls into the entry html, so a bundle built for the
// other lane silently talks to a port with no mock behind it. fail loudly instead
const ENTRY_HTML = resolve(PROJECT_ROOT, 'dist/200.html');
if (existsSync(ENTRY_HTML)) {
	const expected = new URL(env.NUXT_PUBLIC_API_BASE_URL!).host;
	if (!readFileSync(ENTRY_HTML, 'utf-8').includes(expected)) {
		console.error(
			`[visual-eval] dist/200.html was not built for ${expected}. Rebuild for this lane:\n` +
				`  bun run build:e2e   # mantle 8788 / cloud 9899 / app 3002 (the default here)\n` +
				`  bun run build:test  # mantle 8787 / cloud 9898 / app 3001 (run with SKY_PORT=3001 MOCK_MANTLE_PORT=8787 MOCK_CLOUD_PORT=9898)`
		);
		process.exit(1);
	}
}

const run = spawnSync(
	'bunx',
	['playwright', 'test', '--project=mobile-chromium', SPEC, ...passthrough],
	{ cwd: PROJECT_ROOT, env, stdio: 'inherit' }
);

if (!existsSync(REPORT_FILE)) {
	console.error(`[visual-eval] no report at ${REPORT_FILE}; the run never reached the measurement`);
	process.exit(run.status ?? 1);
}

const report = JSON.parse(readFileSync(REPORT_FILE, 'utf-8')) as VisualEvalReport;
console.log(`\n${formatTable(report)}`);
console.log(`\nmeasured ${report.screens.length} screen(s) at ${report.generatedAt}`);
console.log(`report:      ${REPORT_FILE}`);
console.log(`screenshots: ${report.screens.map((s) => s.screenshot).join('\n             ')}`);

// a soft-failed budget still fails the playwright run; keep that exit code
process.exit(run.status ?? 1);
