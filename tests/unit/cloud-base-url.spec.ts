// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(ROOT, 'src');

/*
 * `cloudBaseUrl` exists in sky for ONE reason: the unauthenticated root ping the startup preflight
 * uses to tell whether cloud is reachable. Every real cloud call is `/v1/*`, which is gated behind
 * ADMIN_API_KEY and therefore has to go through crust's nitro routes -- a native app cannot hold
 * that secret. This gate stops the config key being quietly repurposed into a direct data path.
 */

function sourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...sourceFiles(full));
		else if (['.ts', '.vue'].includes(extname(entry.name))) out.push(full);
	}
	return out;
}

describe('cloudBaseUrl stays a health probe', () => {
	it('is never read from sky source; only the crust layer store consumes it', () => {
		const offenders: string[] = [];

		for (const file of sourceFiles(SRC)) {
			readFileSync(file, 'utf-8')
				.split('\n')
				.forEach((line, index) => {
					const trimmed = line.trim();
					if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
					if (line.includes('cloudBaseUrl')) {
						offenders.push(`${relative(ROOT, file)}:${index + 1}`);
					}
				});
		}

		expect(offenders).toEqual([]);
	});

	it('never calls a gated /v1/ cloud route directly', () => {
		const offenders: string[] = [];

		for (const file of sourceFiles(SRC)) {
			readFileSync(file, 'utf-8')
				.split('\n')
				.forEach((line, index) => {
					const trimmed = line.trim();
					if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
					// a literal cloud origin carrying a /v1/ path is the shape that needs the admin key
					if (/cloud\.earth-app\.com\/v1\//.test(line)) {
						offenders.push(`${relative(ROOT, file)}:${index + 1}`);
					}
				});
		}

		expect(offenders).toEqual([]);
	});
});
