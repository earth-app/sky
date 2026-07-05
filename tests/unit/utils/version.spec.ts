// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	parseSemver,
	semverToVersionCode,
	setAndroidVersions,
	setIosVersions
} from '~/utils/version';

describe('parseSemver', () => {
	it('parses a plain semver', () => {
		expect(parseSemver('1.0.1')).toEqual({ major: 1, minor: 0, patch: 1 });
	});

	it('drops prerelease and build suffixes', () => {
		expect(parseSemver('2.3.4-beta.1')).toEqual({ major: 2, minor: 3, patch: 4 });
		expect(parseSemver('2.3.4+ci.9')).toEqual({ major: 2, minor: 3, patch: 4 });
	});

	it('rejects malformed versions', () => {
		expect(() => parseSemver('1.0')).toThrow();
		expect(() => parseSemver('v1.0.0')).toThrow();
	});
});

describe('semverToVersionCode', () => {
	it('derives a monotonic integer', () => {
		expect(semverToVersionCode('1.0.1')).toBe(10001);
		expect(semverToVersionCode('1.1.0')).toBe(10100);
		expect(semverToVersionCode('2.0.0')).toBe(20000);
	});

	it('stays strictly increasing across bumps', () => {
		expect(semverToVersionCode('1.0.1')).toBeGreaterThan(semverToVersionCode('1.0.0'));
		expect(semverToVersionCode('1.1.0')).toBeGreaterThan(semverToVersionCode('1.0.99'));
		expect(semverToVersionCode('2.0.0')).toBeGreaterThan(semverToVersionCode('1.99.99'));
	});

	it('rejects minor/patch that would collide', () => {
		expect(() => semverToVersionCode('1.100.0')).toThrow();
		expect(() => semverToVersionCode('1.0.100')).toThrow();
	});
});

describe('setIosVersions', () => {
	const sample = `
			CURRENT_PROJECT_VERSION = 1;
			MARKETING_VERSION = 1.0;
			PRODUCT_NAME = "$(TARGET_NAME)";
			CURRENT_PROJECT_VERSION = 1;
			MARKETING_VERSION = 1.0.0;`;

	it('rewrites every marketing and build field', () => {
		const out = setIosVersions(sample, '1.0.1', 10001);
		expect(out).not.toMatch(/MARKETING_VERSION = 1\.0(\.0)?;/);
		expect(out.match(/MARKETING_VERSION = 1\.0\.1;/g)).toHaveLength(2);
		expect(out.match(/CURRENT_PROJECT_VERSION = 10001;/g)).toHaveLength(2);
		expect(out).toContain('PRODUCT_NAME = "$(TARGET_NAME)";');
	});
});

describe('setAndroidVersions', () => {
	const sample = `        versionCode 1\n        versionName "0.1.0"\n        testInstrumentationRunner "x"`;

	it('rewrites versionName and versionCode only', () => {
		const out = setAndroidVersions(sample, '1.0.1', 10001);
		expect(out).toContain('versionCode 10001');
		expect(out).toContain('versionName "1.0.1"');
		expect(out).toContain('testInstrumentationRunner "x"');
	});
});
