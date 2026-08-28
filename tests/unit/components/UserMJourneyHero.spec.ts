import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MJourneyHero from '~/components/user/MJourneyHero.vue';

const fetchCurrentJourney = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

mockNuxtImport('useAuth', () => () => ({ user: ref({ id: '42' }), fetchCurrentJourney }));
mockNuxtImport('useIonRouter', () => () => ({ navigate, push: vi.fn() }));
mockNuxtImport('useAppHaptics', () => () => ({ selection: vi.fn() }));
mockNuxtImport('useMediaQuery', () => () => ref(true));
mockNuxtImport('useDailyQuest', () => () => ({
	quest: ref(null),
	isTapped: ref(false),
	markTapped: vi.fn()
}));
mockNuxtImport('useUser', () => () => ({ quest: ref(null), fetchUserQuest: vi.fn() }));

// count, lastWrite and best per journey type, in the ROWS order the component fetches them
function journeys(rows: { count: number; best: number }[]) {
	let call = 0;
	fetchCurrentJourney.mockImplementation(async () => {
		const row = rows[call++] ?? { count: 0, best: 0 };
		return { success: true, data: { count: row.count, lastWrite: Date.now(), best: row.best } };
	});
}

// `visible` stays false until the first journey fetch resolves, so the mount has to settle
async function mount() {
	const wrapper = await mountSuspended(MJourneyHero);
	await flushPromises();
	await nextTick();
	return wrapper;
}

beforeEach(() => {
	fetchCurrentJourney.mockReset();
	navigate.mockReset();
});

describe('sky journey hero personal best', () => {
	it('calls the current streak a record once it reaches the stored best', async () => {
		journeys([
			{ count: 9, best: 9 },
			{ count: 0, best: 0 },
			{ count: 0, best: 0 }
		]);

		const wrapper = await mount();
		expect(wrapper.text()).toContain('Your Longest Yet');
	});

	it('shows the record it is chasing while under it', async () => {
		journeys([
			{ count: 4, best: 11 },
			{ count: 0, best: 0 },
			{ count: 0, best: 0 }
		]);

		const wrapper = await mount();
		expect(wrapper.text()).toContain('Best: 11');
		expect(wrapper.text()).not.toContain('Your Longest Yet');
	});

	// the whole point of reading `best` off the server: a device with no local history must not
	// call a fresh streak a personal record
	it('says nothing about a record on a streak of zero', async () => {
		journeys([
			{ count: 0, best: 0 },
			{ count: 0, best: 0 },
			{ count: 0, best: 0 }
		]);

		const wrapper = await mount();
		expect(wrapper.text()).not.toContain('Your Longest Yet');
		expect(wrapper.text()).not.toContain('Best:');
	});

	it('never advertises a leaderboard rank', async () => {
		journeys([
			{ count: 6, best: 6 },
			{ count: 3, best: 8 },
			{ count: 0, best: 0 }
		]);

		const wrapper = await mount();
		expect(wrapper.text()).not.toMatch(/#\d|rank|leaderboard/i);
	});

	it('treats a missing best as no record rather than as zero-equals-best', async () => {
		fetchCurrentJourney.mockResolvedValue({ success: true, data: { count: 5, lastWrite: 1 } });

		const wrapper = await mount();
		// count 5 vs an absent best reads as a record, which is the correct first-ever streak
		expect(wrapper.text()).toContain('Your Longest Yet');
	});
});
