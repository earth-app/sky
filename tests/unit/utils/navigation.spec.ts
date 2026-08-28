// @vitest-environment node
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { notificationRoute } from '~/utils/navigation';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PAGES = join(ROOT, 'src/pages');

/** Every route the file-based router produces, with `[param]` left in place. */
function routes(dir: string, prefix = ''): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			out.push(...routes(join(dir, entry.name), `${prefix}/${entry.name}`));
		} else if (entry.name.endsWith('.vue')) {
			out.push(entry.name === 'index.vue' ? prefix || '/' : `${prefix}/${entry.name.slice(0, -4)}`);
		}
	}
	return out;
}

const ROUTES = routes(PAGES);

/** Whether a concrete path is served by one of those routes. */
function resolves(path: string): boolean {
	const wanted = path.split('/').filter(Boolean);
	return ROUTES.some((route) => {
		const parts = route.split('/').filter(Boolean);
		if (parts.length !== wanted.length) return false;
		return parts.every((part, i) => part.startsWith('[') || part === wanted[i]);
	});
}

// every distinct `link` mantle2 and cloud write into a notification today
const EMITTED_LINKS = [
	'/admin?tab=approvals',
	'/activities/00000000000000000000abcd',
	'/events/000000000000000000001234',
	'/profile',
	'/profile/notifications',
	'/profile/@someone',
	'/profile/quests?open=say_one_thing'
];

describe('notification links land on a route sky actually has', () => {
	it('found the page tree', () => {
		expect(ROUTES.length).toBeGreaterThan(20);
		expect(resolves('/tabs/dashboard')).toBe(true);
		expect(resolves('/tabs/nope')).toBe(false);
	});

	// this is the bug: `/admin?tab=approvals` became `/tabs/admin`, which did not exist, so tapping
	// the staged-activities push did nothing
	for (const link of EMITTED_LINKS) {
		it(`maps ${link} onto a real route`, () => {
			const mapped = notificationRoute(link);
			expect(mapped).not.toBeNull();
			const path = mapped!.split('?')[0]!;
			expect(resolves(path), `${link} -> ${mapped} does not resolve`).toBe(true);
		});
	}

	it('sends the admin suite to the one surface sky has for it', () => {
		expect(notificationRoute('/admin?tab=approvals')).toBe('/tabs/admin');
		expect(notificationRoute('/admin')).toBe('/tabs/admin');
	});

	it('keeps quests on their own tab and carries the deep link', () => {
		expect(notificationRoute('/profile/quests?open=say_one_thing')).toBe(
			'/tabs/quests?open=say_one_thing'
		);
	});

	// sky has top-level /profile routes, so these must not be prefixed - and this is the same rule
	// resolveDeepLink applies, which is why both now read one table
	it('passes a profile link through unprefixed', () => {
		expect(notificationRoute('/profile')).toBe('/profile');
		expect(notificationRoute('/profile/notifications')).toBe('/profile/notifications');
		expect(notificationRoute('/profile/@someone')).toBe('/profile/@someone');
	});

	it('passes an unmapped path through with the tabs prefix', () => {
		expect(notificationRoute('/activities/abc')).toBe('/tabs/activities/abc');
		expect(notificationRoute('activities/abc')).toBe('/tabs/activities/abc');
	});

	it('leaves an external link alone and returns null for nothing', () => {
		expect(notificationRoute('https://earth-app.com/blog')).toBe('https://earth-app.com/blog');
		expect(notificationRoute('')).toBeNull();
		expect(notificationRoute(null)).toBeNull();
		expect(notificationRoute(undefined)).toBeNull();
	});
});
