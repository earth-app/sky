import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';

test.describe('Native toast content', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('no toast ever renders an "undefined" fragment for a logged-in user', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('native mock + mock journey response');
		await asUser({ username: 'journeyuser' });
		await gotoHydrated('/tabs/dashboard');
		// give any async journey/sync toasts a beat to fire
		await page.waitForTimeout(2000);
		const toasts: string[] = await page.evaluate(() => (window as any).__toasts ?? []);
		for (const t of toasts) {
			expect(t).not.toMatch(/undefined/i);
			expect(t).not.toMatch(/\bNaN\b/);
		}
	});
});
