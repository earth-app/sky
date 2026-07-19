import type { NatureMinutes } from 'types/trails';
import type { UserQuestProgress } from 'types/user';
import { describe, expect, it } from 'vitest';
import {
	buildDigestSlot,
	buildEveningSlot,
	buildMiddaySlot,
	buildMorningSlot,
	hasActedToday,
	natureMinutesToday,
	questActedToday,
	type DigestContext
} from '~/composables/useDailyNotifications';

const NOW = Date.now();
const todayISO = new Date(NOW).toISOString();
const twoDaysAgoISO = new Date(NOW - 2 * 86400000).toISOString();

function ctx(overrides: Partial<DigestContext> = {}): DigestContext {
	return {
		activeQuestTitle: null,
		activeQuestRoute: null,
		questNudgeOk: false,
		pledge: null,
		natureMinutes: null,
		expedition: null,
		contributedToday: false,
		actedToday: false,
		...overrides
	};
}

function nm(partial: Partial<NatureMinutes> = {}): NatureMinutes {
	return {
		week: '2026-W29',
		minutes: 0,
		target: 120,
		best: 0,
		sources: [],
		updated_at: todayISO,
		...partial
	};
}

describe('natureMinutesToday', () => {
	it('sums only sources credited today', () => {
		const value = nm({
			sources: [
				{ kind: 'trail_step', minutes: 15, at: todayISO },
				{ kind: 'healthkit', minutes: 20, at: todayISO },
				{ kind: 'manual', minutes: 99, at: twoDaysAgoISO }
			]
		});
		expect(natureMinutesToday(value, NOW)).toBe(35);
	});

	it('returns 0 for null / missing sources / garbage timestamps', () => {
		expect(natureMinutesToday(null, NOW)).toBe(0);
		expect(natureMinutesToday(nm({ sources: undefined as never }), NOW)).toBe(0);
		expect(
			natureMinutesToday(nm({ sources: [{ kind: 'manual', minutes: 10, at: 'not-a-date' }] }), NOW)
		).toBe(0);
	});

	it('never counts negative minutes', () => {
		const value = nm({ sources: [{ kind: 'manual', minutes: -50, at: todayISO }] });
		expect(natureMinutesToday(value, NOW)).toBe(0);
	});
});

describe('questActedToday', () => {
	function progress(entries: UserQuestProgress['progress']): UserQuestProgress {
		return {
			quest: { id: 'q1' } as never,
			questId: 'q1',
			currentStep: {} as never,
			currentStepIndex: 1,
			completed: false,
			progress: entries
		};
	}

	it('is true when any step was submitted today (flat + alt-group)', () => {
		expect(questActedToday(progress([{ type: 'x', submittedAt: NOW }]), NOW)).toBe(true);
		expect(questActedToday(progress([[{ type: 'x', altIndex: 0, submittedAt: NOW }]]), NOW)).toBe(
			true
		);
	});

	it('is false for only-older submissions, null slots, or no active quest', () => {
		expect(questActedToday(progress([{ type: 'x', submittedAt: NOW - 3 * 86400000 }]), NOW)).toBe(
			false
		);
		expect(questActedToday(progress([null as never, undefined as never]), NOW)).toBe(false);
		expect(questActedToday(null, NOW)).toBe(false);
	});
});

describe('hasActedToday', () => {
	it('ORs the nature-minute and quest signals', () => {
		expect(
			hasActedToday(null, nm({ sources: [{ kind: 'healthkit', minutes: 5, at: todayISO }] }), NOW)
		).toBe(true);
		expect(hasActedToday(null, null, NOW)).toBe(false);
	});
});

describe('buildMorningSlot priority', () => {
	it('prefers the active quest nudge when its step is ready', () => {
		const slot = buildMorningSlot(
			ctx({ questNudgeOk: true, activeQuestTitle: 'Sunrise', activeQuestRoute: '/tabs/quests/q1' })
		);
		expect(slot?.route).toBe('/tabs/quests/q1');
		expect(slot?.body).toContain('Sunrise');
	});

	it('falls to the if-then pledge when no quest nudge', () => {
		const slot = buildMorningSlot(ctx({ pledge: { when: 'I finish coffee', trailId: 't9' } }));
		expect(slot?.route).toBe('/tabs/trails/t9');
		expect(slot?.body).toContain('I finish coffee');
	});

	it('falls to nature minutes remaining, then expedition', () => {
		expect(
			buildMorningSlot(ctx({ natureMinutes: { minutes: 40, target: 120, today: 0 } }))?.route
		).toBe('/tabs/trails');
		expect(
			buildMorningSlot(
				ctx({
					natureMinutes: { minutes: 120, target: 120, today: 0 },
					expedition: { title: 'Ridge', remaining: 30, unit: 'min', percent: 0.5 }
				})
			)?.route
		).toBe('/tabs/circle');
	});

	it('is silent when nothing is goal-shaped to say', () => {
		expect(buildMorningSlot(ctx())).toBeNull();
		expect(
			buildMorningSlot(ctx({ natureMinutes: { minutes: 120, target: 120, today: 0 } }))
		).toBeNull();
	});
});

describe('buildMiddaySlot suppression', () => {
	it('stays silent once the user already acted today', () => {
		expect(
			buildMiddaySlot(
				ctx({
					actedToday: true,
					expedition: { title: 'Ridge', remaining: 30, unit: 'min', percent: 0.4 }
				})
			)
		).toBeNull();
	});

	it('surfaces "your circle needs you" when not contributed', () => {
		const slot = buildMiddaySlot(
			ctx({
				expedition: { title: 'Ridge', remaining: 30, unit: 'min', percent: 0.4 },
				contributedToday: false
			})
		);
		expect(slot?.title).toBe('Your Circle Needs You');
	});

	it('falls back to a nature nudge, else silence', () => {
		expect(
			buildMiddaySlot(ctx({ natureMinutes: { minutes: 10, target: 120, today: 0 } }))?.route
		).toBe('/tabs/trails');
		expect(buildMiddaySlot(ctx())).toBeNull();
	});
});

describe('buildEveningSlot reflection', () => {
	it('celebrates the day when the user acted (personal-best framing, no comparison)', () => {
		const slot = buildEveningSlot(
			ctx({ actedToday: true, natureMinutes: { minutes: 35, target: 120, today: 35 } })
		);
		expect(slot?.title).toBe('Nicely Done Today');
		expect(slot?.body).toContain('35');
		expect(slot?.body.toLowerCase()).toContain('own pace');
	});

	it('nudges a near-complete circle', () => {
		const slot = buildEveningSlot(
			ctx({ expedition: { title: 'Ridge', remaining: 10, unit: 'min', percent: 0.9 } })
		);
		expect(slot?.route).toBe('/tabs/circle');
	});

	it('offers a prosocial trailmark when nothing else and not acted', () => {
		expect(buildEveningSlot(ctx())?.route).toBe('/tabs/trailmarks');
	});

	it('stays silent when acted but has no minutes summary and nothing else', () => {
		expect(buildEveningSlot(ctx({ actedToday: true }))).toBeNull();
	});
});

describe('buildDigestSlot dispatch', () => {
	it('routes each key to its builder', () => {
		const c = ctx({
			questNudgeOk: true,
			activeQuestTitle: 'A',
			activeQuestRoute: '/tabs/quests/a'
		});
		expect(buildDigestSlot('morning', c)?.route).toBe('/tabs/quests/a');
		expect(buildDigestSlot('midday', ctx({ actedToday: true }))).toBeNull();
		expect(buildDigestSlot('evening', ctx())?.route).toBe('/tabs/trailmarks');
	});
});
