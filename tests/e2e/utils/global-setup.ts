import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockServers } from './mock-server';

const __dirname = dirname(fileURLToPath(import.meta.url));
// repo root is three up from tests/e2e/utils (must match coverage.ts + fixtures.ts)
const PROJECT_ROOT = resolve(__dirname, '../../..');
const RAW_COVERAGE_DIR = resolve(PROJECT_ROOT, '.coverage', 'raw');
const INTEGRATION_SESSION_FILE = resolve(PROJECT_ROOT, '.integration-session.json');

async function loginAndCacheAdminSession() {
	const apiBase = process.env.NUXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8787';
	const auth = Buffer.from('admin:admin').toString('base64');
	const res = await fetch(`${apiBase}/v2/users/login`, {
		method: 'POST',
		headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }
	});
	if (!res.ok) {
		throw new Error(`[setup] integration login failed (${res.status}): ${await res.text()}`);
	}
	const body = (await res.json()) as { session_token?: string };
	const token = body.session_token;
	if (!token) {
		throw new Error('[setup] integration login succeeded but no session_token returned');
	}
	let user: Record<string, any> = {
		id: 'real-admin',
		username: 'admin',
		account: { account_type: 'ADMINISTRATOR' }
	};
	const me = await fetch(`${apiBase}/v2/users/current`, {
		headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
	});
	if (me.ok) user = (await me.json()) as Record<string, any>;
	writeFileSync(INTEGRATION_SESSION_FILE, JSON.stringify({ session_token: token, user }));
	console.log(`[setup] cached real admin session (user=${user.username || 'admin'})`);
}

export default async function globalSetup() {
	// Clear any previous coverage run
	if (existsSync(RAW_COVERAGE_DIR)) {
		rmSync(RAW_COVERAGE_DIR, { recursive: true, force: true });
	}
	if (process.env.COVERAGE === '1') {
		mkdirSync(RAW_COVERAGE_DIR, { recursive: true });
	}
	// Remove any stale session from a prior run before deciding whether to mint
	// a new one - keeps mock-mode runs from accidentally seeing the file.
	if (existsSync(INTEGRATION_SESSION_FILE)) {
		rmSync(INTEGRATION_SESSION_FILE, { force: true });
	}

	// Skip mock server boot when an explicit MOCK_DISABLED flag is set --
	// e.g. when running the integration workflow against the real mantle2/cloud.
	if (process.env.MOCK_DISABLED === '1') {
		console.log('[setup] MOCK_DISABLED=1 → skipping mock server boot');
		await loginAndCacheAdminSession();
	} else {
		await startMockServers();
	}

	const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3001';
	const prodMode = process.env.PLAYWRIGHT_PROD === '1';
	const deadline = Date.now() + 180_000;
	let up = false;
	while (Date.now() < deadline && !up) {
		try {
			const r = await fetch(baseURL, { signal: AbortSignal.timeout(15_000) });
			if (r.status < 500) {
				up = true;
				console.log(`[setup] ${prodMode ? 'prod' : 'dev'} server reachable (status=${r.status})`);
				break;
			}
		} catch {
			// not yet up
		}
		await new Promise((r) => setTimeout(r, 1500));
	}
	if (!up) {
		console.warn('[setup] server warmup timed out - tests may have slow first hits');
		return;
	}

	if (prodMode) {
		// Static `dist/` bundle has no per-route Vite compile. Done.
		return;
	}

	// Dev mode: pre-compile the heaviest routes (each one triggers a Vite cold
	// compile the first time it's visited). This makes individual tests snappy.
	const warmRoutes = [
		'/',
		'/login',
		'/signup',
		'/verify-email',
		'/forgot-password',
		'/reset-password',
		'/tabs/dashboard',
		'/tabs/discover',
		'/tabs/profile',
		'/tabs/settings'
	];
	const warmStart = Date.now();
	let warmed = 0;
	for (const route of warmRoutes) {
		try {
			await fetch(`${baseURL}${route}`, { signal: AbortSignal.timeout(45_000) });
			warmed++;
		} catch {
			// best effort
		}
	}
	console.log(
		`[setup] warmed ${warmed}/${warmRoutes.length} routes in ${Date.now() - warmStart}ms`
	);
}
