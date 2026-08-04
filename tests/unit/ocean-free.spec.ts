// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIVITY_TYPE, COUNTRIES, PRIVACY, toVisibility, VISIBILITY } from 'types/enums';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(ROOT, 'src');

function sourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...sourceFiles(full));
		else if (['.ts', '.vue'].includes(extname(entry.name))) out.push(full);
	}
	return out;
}

describe('the ocean dependency stays gone', () => {
	it('is not imported anywhere in src', () => {
		const offenders: string[] = [];

		for (const file of sourceFiles(SRC)) {
			const text = readFileSync(file, 'utf-8');
			if (/from '@earth-app\/ocean'|require\('@earth-app\/ocean'\)/.test(text)) {
				offenders.push(relative(ROOT, file));
			}
		}

		expect(offenders).toEqual([]);
	});

	it('is not declared as a dependency', () => {
		const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
		expect(pkg.dependencies?.['@earth-app/ocean']).toBeUndefined();
		expect(pkg.devDependencies?.['@earth-app/ocean']).toBeUndefined();
	});

	it('is not referenced by the build config', () => {
		expect(readFileSync(join(ROOT, 'nuxt.config.ts'), 'utf-8')).not.toContain('@earth-app/ocean');
	});
});

describe('the crust layer supplies the replacements', () => {
	it('resolves types/enums through the layer alias', () => {
		expect([...VISIBILITY]).toEqual(['PRIVATE', 'UNLISTED', 'PUBLIC']);
		expect([...PRIVACY]).toEqual(['PRIVATE', 'CIRCLE', 'MUTUAL', 'PUBLIC']);
		expect(ACTIVITY_TYPE.length).toBeGreaterThan(0);
	});

	it('carries the country fields the profile editor renders', () => {
		const us = COUNTRIES.find((country) => country.name === 'UNITED_STATES');
		expect(us?.countryName).toBe('United States');
		expect(us?.code).toBe('US');
		expect(us?.flagEmoji).toBeTruthy();
	});

	// ocean's valueOf threw on an unknown name; the coercer must fall back instead
	it('coerces an unknown visibility instead of throwing', () => {
		expect(toVisibility('SOMETHING_NEW')).toBe('PUBLIC');
	});
});
