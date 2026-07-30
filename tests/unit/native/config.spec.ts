import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

/** the one user-facing product name; `sky` and `crust` are internal handles */
const DISPLAY_NAME = 'The Earth App';

const STRINGS_XML = 'android/app/src/main/res/values/strings.xml';
const INFO_PLIST = 'ios/App/App/Info.plist';

function androidString(xml: string, name: string): string | undefined {
	return new RegExp(`<string name="${name}">([^<]*)</string>`).exec(xml)?.[1];
}

function plistString(plist: string, key: string): string | undefined {
	return new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist)?.[1];
}

describe('native app display name', () => {
	// android's app_name is not cosmetic: the os substitutes it into every runtime permission
	// dialog ("Allow sky to send you notifications?"), the launcher label and app-info
	it('shows the product name on android, not the internal handle', () => {
		const xml = read(STRINGS_XML);
		expect(androidString(xml, 'app_name')).toBe(DISPLAY_NAME);
		expect(androidString(xml, 'title_activity_main')).toBe(DISPLAY_NAME);
	});

	it('shows the product name on ios', () => {
		expect(plistString(read(INFO_PLIST), 'CFBundleDisplayName')).toBe(DISPLAY_NAME);
	});

	// capacitor only reads appName when it CREATES a platform, so this agreeing is necessary
	// but not sufficient; the two asserts above are what actually ship
	it('declares the product name in the capacitor config', () => {
		expect(read('capacitor.config.ts')).toContain(`appName: '${DISPLAY_NAME}'`);
	});

	// the guard that catches a regenerated platform: `cap add android` writes the directory
	// name into strings.xml and `cap sync` never corrects it
	it('leaks neither internal handle into a display string', () => {
		const xml = read(STRINGS_XML);
		for (const key of ['app_name', 'title_activity_main']) {
			const value = androidString(xml, key) ?? '';
			expect(value.toLowerCase(), `${key} must not expose an internal handle`).not.toMatch(
				/\b(sky|crust)\b/
			);
		}
		expect(plistString(read(INFO_PLIST), 'CFBundleDisplayName')?.toLowerCase()).not.toMatch(
			/\b(sky|crust)\b/
		);
	});

	// the other half of the rule: `sky` is correct in IDENTIFIERS, and renaming those would
	// break the bundle id, oauth redirects and the custom scheme. asserted so a broad
	// search-and-replace for the display-name bug cannot quietly take them with it
	it('keeps the internal handle in identifiers, which are not display strings', () => {
		const xml = read(STRINGS_XML);
		expect(androidString(xml, 'package_name')).toBe('com.earthapp.sky');
		expect(androidString(xml, 'custom_url_scheme')).toBe('com.earthapp.sky');
		expect(read('capacitor.config.ts')).toContain(`appId: 'com.earthapp.sky'`);
	});
});
