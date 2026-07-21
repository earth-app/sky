import {
	useSiteTour,
	type SiteTour,
	type SiteTourStep
} from '@earth-app/crust/src/composables/useSiteTour';
import { beforeEach, describe, expect, it } from 'vitest';

const STORAGE_KEY = 'earth_app_completed_tours';

function makeTour(id: string, steps: SiteTourStep[]): SiteTour {
	return { id, name: `${id} tour`, steps };
}

const trailsSteps: SiteTourStep[] = [
	{ id: 'trails-header', title: 'Curiosity Trails', description: 'x', waitFor: 'trails-header' },
	{ title: 'Your Nature Minutes', description: 'x', placement: 'center' },
	{ id: 'trail-list', title: 'Pick One', description: 'x', waitFor: 'trail-list' },
	{ id: 'trail-journal-button', title: 'Your Private Journal', description: 'x' }
];

const trailmarksSteps: SiteTourStep[] = [
	{
		id: 'trailmark-nearby',
		title: 'Trailmarks Nearby',
		description: 'x',
		waitFor: 'trailmark-nearby'
	},
	{ id: 'trailmark-composer', title: 'Leave One From Here', description: 'x' },
	{ id: 'trailmark-radius', title: 'Widen or Narrow Your Search', description: 'x' }
];

const sharedGardenSteps: SiteTourStep[] = [
	{ id: 'shared-garden', title: 'Your Shared Garden', description: 'x', waitFor: 'shared-garden' },
	{ id: 'garden-canvas', title: 'Watch It Grow', description: 'x', waitFor: 'garden-canvas' },
	{ id: 'circle-members', title: 'Your Circle', description: 'x', waitFor: 'circle-members' },
	{
		id: 'circle-expedition',
		title: 'Set a Shared Goal',
		description: 'x',
		waitFor: 'circle-expedition'
	},
	{
		id: 'expedition-ring',
		title: 'Track Your Progress',
		description: 'x',
		condition: () => true
	},
	{ id: 'circle-kudos', title: 'Cheer Each Other On', description: 'x', condition: () => false }
];

beforeEach(() => {
	// reset the module-level completed-set + persisted store between tests
	const tour = useSiteTour();
	tour.clearCompleted();
	if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
	// leave no tour active/registered from a prior test
	tour.stopTour();
	for (const id of ['trails', 'trailmarks', 'shared-garden', 'welcome']) tour.unregisterTour(id);
});

describe('useSiteTour registration + activation', () => {
	it('registers a tour and startTour activates it at step 0', () => {
		const tour = useSiteTour();
		tour.registerTour(makeTour('trails', trailsSteps));
		tour.startTour('trails');
		expect(tour.isActiveTour('trails')).toBe(true);
		expect(tour.activeTourId.value).toBe('trails');
		expect(tour.activeStepIndex.value).toBe(0);
		expect(tour.getActiveTour()?.steps).toHaveLength(trailsSteps.length);
	});

	it('startTour clamps a start step into range', () => {
		const tour = useSiteTour();
		tour.registerTour(makeTour('trailmarks', trailmarksSteps));
		tour.startTour('trailmarks', 99);
		expect(tour.activeStepIndex.value).toBe(trailmarksSteps.length - 1);
	});

	it('goToStep clamps below zero and above the last step', () => {
		const tour = useSiteTour();
		tour.registerTour(makeTour('trailmarks', trailmarksSteps));
		tour.startTour('trailmarks');
		tour.goToStep(-5);
		expect(tour.activeStepIndex.value).toBe(0);
		tour.goToStep(999);
		expect(tour.activeStepIndex.value).toBe(trailmarksSteps.length - 1);
	});

	it('does not activate an unknown tour', () => {
		const tour = useSiteTour();
		tour.startTour('does-not-exist');
		expect(tour.activeTourId.value).toBe(null);
	});
});

describe('useSiteTour completion gating', () => {
	it('startTourIfNew starts an unseen tour and skips a completed one', () => {
		const tour = useSiteTour();
		tour.registerTour(makeTour('shared-garden', sharedGardenSteps));

		expect(tour.startTourIfNew('shared-garden')).toBe(true);
		expect(tour.isActiveTour('shared-garden')).toBe(true);

		tour.stopTour({ completed: true });
		expect(tour.hasCompleted('shared-garden')).toBe(true);
		expect(tour.startTourIfNew('shared-garden')).toBe(false);
	});

	it('markCompleted persists across a fresh composable instance', () => {
		const a = useSiteTour();
		a.markCompleted('trails');
		expect(a.hasCompleted('trails')).toBe(true);
		expect(window.localStorage.getItem(STORAGE_KEY)).toContain('trails');

		const b = useSiteTour();
		expect(b.hasCompleted('trails')).toBe(true);
	});

	it('clearCompleted resets a single tour', () => {
		const tour = useSiteTour();
		tour.markCompleted('trails');
		tour.markCompleted('trailmarks');
		tour.clearCompleted('trails');
		expect(tour.hasCompleted('trails')).toBe(false);
		expect(tour.hasCompleted('trailmarks')).toBe(true);
	});
});

describe('SiteTourStep shape of the new feature tours', () => {
	const all: Array<[string, SiteTourStep[]]> = [
		['trails', trailsSteps],
		['trailmarks', trailmarksSteps],
		['shared-garden', sharedGardenSteps]
	];

	it.each(all)('%s steps all carry a non-empty title and description', (_id, steps) => {
		for (const s of steps) {
			expect(s.title.trim().length).toBeGreaterThan(0);
			expect(s.description.trim().length).toBeGreaterThan(0);
		}
	});

	it.each(all)('%s step ids are unique within the tour', (_id, steps) => {
		const ids = steps.map((s) => s.id).filter((v): v is string => !!v);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('gated shared-garden steps are only visible when their condition passes', () => {
		const visible = sharedGardenSteps.filter((s) => !s.condition || s.condition());
		// circle-kudos condition is false in this fixture, so it drops out
		expect(visible.map((s) => s.id)).not.toContain('circle-kudos');
		expect(visible.map((s) => s.id)).toContain('expedition-ring');
	});
});
