import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MAnalytics from '~/components/admin/MAnalytics.vue';
import MBlacklist from '~/components/admin/MBlacklist.vue';

const makeClientAPIRequest = vi.hoisted(() => vi.fn());

vi.mock('utils', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	makeClientAPIRequest
}));

mockNuxtImport('useAuthStore', () => () => ({ sessionToken: 'token' }));

async function mount(component: unknown) {
	const wrapper = await mountSuspended(component as never);
	await flushPromises();
	await nextTick();
	return wrapper;
}

beforeEach(() => {
	makeClientAPIRequest.mockReset();
});

describe('sky admin analytics', () => {
	it('shows the funnel and the top rows for the default range', async () => {
		makeClientAPIRequest.mockResolvedValue({
			success: true,
			data: {
				since: '2026-08-26T00:00:00Z',
				until: '2026-08-27T00:00:00Z',
				configured: true,
				by_country: [
					{ dimensions: { clientCountryName: 'US' }, sum: { requests: 90 } },
					{ dimensions: { clientCountryName: 'CA' }, sum: { requests: 400 } }
				],
				by_status: [{ dimensions: { edgeResponseStatus: 200 }, sum: { requests: 480 } }],
				top_paths: [
					{ dimensions: { clientRequestPath: '/v2/users/current' }, sum: { requests: 40 } }
				],
				signup_funnel: {
					signup_views: 200,
					signups_completed: 50,
					verifications_completed: 25
				}
			}
		});

		const wrapper = await mount(MAnalytics);
		const text = wrapper.text();

		expect(text).toContain('Signup Funnel');
		expect(text).toContain('25.0% of views completed a signup');
		expect(text).toContain('/v2/users/current');
		// sorted by requests, so the bigger country leads regardless of payload order
		expect(text.indexOf('CA')).toBeLessThan(text.indexOf('US'));
		expect(makeClientAPIRequest.mock.calls[0]![0]).toContain('/v2/admin/analytics?since=');
	});

	it('says so when the source is not configured rather than showing zeroes', async () => {
		makeClientAPIRequest.mockResolvedValue({
			success: true,
			data: {
				since: '',
				until: '',
				configured: false,
				by_country: [],
				by_status: [],
				top_paths: [],
				signup_funnel: { signup_views: 0, signups_completed: 0, verifications_completed: 0 }
			}
		});

		const wrapper = await mount(MAnalytics);
		expect(wrapper.text()).toContain('Analytics Not Configured');
		expect(wrapper.text()).not.toContain('Signup Funnel');
	});

	it('shows an empty state when the request fails', async () => {
		makeClientAPIRequest.mockResolvedValue({ success: false, message: 'nope' });
		const wrapper = await mount(MAnalytics);
		expect(wrapper.text()).toContain('No Analytics');
	});
});

describe('sky admin blacklist', () => {
	it('lists only entries of the selected kind', async () => {
		makeClientAPIRequest.mockResolvedValue({
			success: true,
			data: {
				entries: [
					{ kind: 'username', value: 'spammer' },
					{ kind: 'email', value: 'bad@example.com' }
				]
			}
		});

		const wrapper = await mount(MBlacklist);
		expect(wrapper.text()).toContain('spammer');
		// the payload carried an email row; the username filter must not render it
		expect(wrapper.text()).not.toContain('bad@example.com');
		expect(makeClientAPIRequest.mock.calls[0]![0]).toBe('/v2/admin/blacklist?kind=username');
	});

	it('shows an empty state with nothing blocked', async () => {
		makeClientAPIRequest.mockResolvedValue({ success: true, data: { entries: [] } });
		const wrapper = await mount(MBlacklist);
		expect(wrapper.text()).toContain('Nothing Blacklisted');
	});

	it('url-encodes the value on removal so a special character cannot break the query', async () => {
		makeClientAPIRequest.mockResolvedValue({
			success: true,
			data: { entries: [{ kind: 'username', value: 'a+b spam' }] }
		});

		const wrapper = await mount(MBlacklist);
		expect(wrapper.text()).toContain('a+b spam');

		makeClientAPIRequest.mockClear();
		makeClientAPIRequest.mockResolvedValue({ success: true, data: {} });
		await wrapper.get('ion-button[aria-label="Remove a+b spam"]').trigger('click');
		await flushPromises();

		const [url, , options] = makeClientAPIRequest.mock.calls[0]!;
		expect(url).toBe('/v2/admin/blacklist?kind=username&value=a%2Bb%20spam');
		expect(options).toMatchObject({ method: 'DELETE' });

		// the row goes without a refetch
		expect(wrapper.text()).not.toContain('a+b spam');
	});
});
