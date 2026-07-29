import { beforeEach, describe, expect, it, vi } from 'vitest';

// stateful Map-backed Preferences mock so the measured tier can actually round-trip
const { store, prefsGet, prefsSet } = vi.hoisted(() => {
	const store = new Map<string, string>();
	return {
		store,
		prefsGet: vi.fn(async ({ key }: { key: string }) => ({
			value: store.has(key) ? store.get(key)! : null
		})),
		prefsSet: vi.fn(async ({ key, value }: { key: string; value: string }) => {
			store.set(key, value);
		})
	};
});

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: prefsGet,
		set: prefsSet,
		remove: vi.fn(async () => {}),
		clear: vi.fn(async () => {})
	}
}));

const { logWarn } = vi.hoisted(() => ({ logWarn: vi.fn() }));

// partial: the client logger plugin still imports the real logInfo at nuxt boot
vi.mock('~/composables/useLogger', async (importOriginal) => ({
	...(await importOriginal<typeof import('~/composables/useLogger')>()),
	logWarn
}));

import {
	applyVisualTierClass,
	DEFAULT_VISUAL_TIER,
	demoteVisualTier,
	initVisualTier,
	noteVisualSettings,
	parseStoredVisualTier,
	prefersReducedTransparency,
	recheckDevice,
	renderPolicyFor,
	resetVisualTierState,
	resolveVisualTier,
	startVisualTierWatch,
	TIER_FRAME_BUDGET_MS,
	useVisualTier,
	VISUAL_TIER_PREF_KEY,
	type StoredVisualTier,
	type VisualTierInputs
} from '~/composables/useVisualTier';
import type { TierProbe } from '~/utils/visual-tier';

function inputs(overrides: Partial<VisualTierInputs> = {}): VisualTierInputs {
	return {
		visualEffects: 'auto',
		measured: null,
		demoted: null,
		dataSaverMode: false,
		reducedTransparency: false,
		...overrides
	};
}

function fakeProbe(overrides: Partial<TierProbe> = {}): TierProbe {
	return {
		cores: 8,
		memoryGb: 8,
		dpr: 3,
		saveData: false,
		baselineMs: 8.3,
		blurredMs: 8.5,
		...overrides
	};
}

function glassClasses(): string[] {
	return ['glass-full', 'glass-reduced', 'glass-off'].filter((c) =>
		document.documentElement.classList.contains(c)
	);
}

beforeEach(() => {
	store.clear();
	resetVisualTierState();
	document.documentElement.classList.remove('glass-full', 'glass-reduced', 'glass-off');
	vi.clearAllMocks();
});

describe('resolveVisualTier (auto)', () => {
	it('uses the safe middle before anything has been measured', () => {
		expect(resolveVisualTier(inputs())).toBe(DEFAULT_VISUAL_TIER);
		expect(DEFAULT_VISUAL_TIER).toBe('reduced');
	});

	it('uses the measured tier once a probe has run', () => {
		expect(resolveVisualTier(inputs({ measured: 'full' }))).toBe('full');
		expect(resolveVisualTier(inputs({ measured: 'off' }))).toBe('off');
	});

	it('treats a malformed stored preference like auto', () => {
		const malformed = inputs({ measured: 'full' });
		malformed.visualEffects = 'sparkles' as never;
		expect(resolveVisualTier(malformed)).toBe('full');
	});
});

describe('resolveVisualTier (explicit override)', () => {
	it('beats the measurement in both directions', () => {
		expect(resolveVisualTier(inputs({ visualEffects: 'off', measured: 'full' }))).toBe('off');
		expect(resolveVisualTier(inputs({ visualEffects: 'full', measured: 'off' }))).toBe('full');
	});

	it('is not touched by a session demotion, since the user chose it', () => {
		expect(resolveVisualTier(inputs({ visualEffects: 'full', demoted: 'off' }))).toBe('full');
	});
});

describe('resolveVisualTier (caps)', () => {
	it('caps data saver at reduced', () => {
		expect(resolveVisualTier(inputs({ visualEffects: 'full', dataSaverMode: true }))).toBe(
			'reduced'
		);
		expect(resolveVisualTier(inputs({ measured: 'full', dataSaverMode: true }))).toBe('reduced');
	});

	it('is a cap, not a floor: off stays off under data saver', () => {
		expect(resolveVisualTier(inputs({ visualEffects: 'off', dataSaverMode: true }))).toBe('off');
	});

	it('caps auto with a session demotion', () => {
		expect(resolveVisualTier(inputs({ measured: 'full', demoted: 'reduced' }))).toBe('reduced');
		expect(resolveVisualTier(inputs({ measured: 'reduced', demoted: 'off' }))).toBe('off');
	});

	it('lets reduced transparency force off over everything else', () => {
		expect(resolveVisualTier(inputs({ visualEffects: 'full', reducedTransparency: true }))).toBe(
			'off'
		);
		expect(resolveVisualTier(inputs({ measured: 'full', reducedTransparency: true }))).toBe('off');
	});
});

describe('renderPolicyFor', () => {
	it('gives full a 60fps budget with glass and ambient motion', () => {
		expect(renderPolicyFor('full', true)).toEqual({
			tier: 'full',
			frameBudgetMs: TIER_FRAME_BUDGET_MS.full,
			targetFps: 60,
			glass: true,
			scenes: true,
			ambient: true
		});
	});

	it('halves the budget at reduced', () => {
		const policy = renderPolicyFor('reduced', true);
		expect(policy.frameBudgetMs).toBe(33);
		expect(policy.targetFps).toBe(30);
		expect(policy.glass).toBe(true);
	});

	it('gives off no budget at all', () => {
		expect(renderPolicyFor('off', true)).toMatchObject({
			frameBudgetMs: 0,
			targetFps: 0,
			glass: false,
			ambient: false
		});
	});

	it('keeps glass but drops ambient motion when animations are disabled', () => {
		const policy = renderPolicyFor('full', false);
		expect(policy.glass).toBe(true);
		expect(policy.ambient).toBe(false);
	});

	it('treats both toggles as on when a caller omits them', () => {
		expect(renderPolicyFor('full', true, {})).toMatchObject({ glass: true, scenes: true });
	});

	it('drops the scene and its motion when ambient scenes are off, keeping glass', () => {
		const policy = renderPolicyFor('full', true, { ambientScenes: false });
		expect(policy.scenes).toBe(false);
		expect(policy.ambient).toBe(false);
		expect(policy.glass).toBe(true);
	});

	it('drops glass when translucency is off, keeping the scene', () => {
		const policy = renderPolicyFor('full', true, { translucency: false });
		expect(policy.glass).toBe(false);
		expect(policy.scenes).toBe(true);
		expect(policy.ambient).toBe(true);
	});

	it('keeps the two toggles independent of each other', () => {
		const policy = renderPolicyFor('full', true, { ambientScenes: false, translucency: false });
		expect(policy).toMatchObject({ glass: false, scenes: false, ambient: false });
	});
});

describe('parseStoredVisualTier', () => {
	const record: StoredVisualTier = {
		version: '1.2.3',
		tier: 'full',
		probe: fakeProbe(),
		measuredAt: 1_700_000_000_000
	};

	it('round-trips a real record', () => {
		expect(parseStoredVisualTier(JSON.stringify(record))).toEqual(record);
	});

	it('rejects nothing stored', () => {
		expect(parseStoredVisualTier(null)).toBeNull();
		expect(parseStoredVisualTier('')).toBeNull();
		expect(parseStoredVisualTier(undefined)).toBeNull();
	});

	it('rejects a blob that is not json or not an object', () => {
		expect(parseStoredVisualTier('{not json')).toBeNull();
		expect(parseStoredVisualTier('"a string"')).toBeNull();
		expect(parseStoredVisualTier('null')).toBeNull();
	});

	it('rejects an unknown tier or a missing version', () => {
		expect(parseStoredVisualTier(JSON.stringify({ ...record, tier: 'ultra' }))).toBeNull();
		expect(parseStoredVisualTier(JSON.stringify({ ...record, version: 3 }))).toBeNull();
	});

	it('rejects a missing or non-numeric probe', () => {
		expect(parseStoredVisualTier(JSON.stringify({ ...record, probe: undefined }))).toBeNull();
		expect(
			parseStoredVisualTier(JSON.stringify({ ...record, probe: fakeProbe({ cores: Number.NaN }) }))
		).toBeNull();
		expect(
			parseStoredVisualTier(
				JSON.stringify({ ...record, probe: { ...fakeProbe(), blurredMs: 'fast' } })
			)
		).toBeNull();
	});

	it('rejects a v1-shaped probe that predates the baseline window', () => {
		const v1Probe = { cores: 8, memoryGb: 8, dpr: 3, saveData: false, compositeMs: 9 };
		expect(parseStoredVisualTier(JSON.stringify({ ...record, probe: v1Probe }))).toBeNull();
	});

	it('fills in the optional fields it can live without', () => {
		const parsed = parseStoredVisualTier(
			JSON.stringify({
				version: '1.0.0',
				tier: 'off',
				probe: { cores: 4, memoryGb: 0, dpr: 2, baselineMs: 30, blurredMs: 31 }
			})
		);
		expect(parsed?.measuredAt).toBe(0);
		expect(parsed?.probe.saveData).toBe(false);
	});
});

describe('applyVisualTierClass', () => {
	it('writes exactly one glass class and switches cleanly', () => {
		applyVisualTierClass('full');
		expect(glassClasses()).toEqual(['glass-full']);

		applyVisualTierClass('reduced');
		expect(glassClasses()).toEqual(['glass-reduced']);

		applyVisualTierClass('off');
		expect(glassClasses()).toEqual(['glass-off']);
	});

	it('defaults to the effective tier when called with no argument', () => {
		noteVisualSettings({ visualEffects: 'off', dataSaverMode: false, animations: true });
		applyVisualTierClass();
		expect(glassClasses()).toEqual(['glass-off']);
	});

	it('writes glass-off when translucency is off, even for an explicitly passed tier', () => {
		noteVisualSettings({
			visualEffects: 'full',
			dataSaverMode: false,
			animations: true,
			translucency: false
		});

		applyVisualTierClass();
		expect(glassClasses()).toEqual(['glass-off']);

		applyVisualTierClass('full');
		expect(glassClasses()).toEqual(['glass-off']);
	});

	it('restores the tier class once translucency comes back on', () => {
		noteVisualSettings({
			visualEffects: 'full',
			dataSaverMode: false,
			animations: true,
			translucency: false
		});
		applyVisualTierClass();
		expect(glassClasses()).toEqual(['glass-off']);

		noteVisualSettings({ visualEffects: 'full', dataSaverMode: false, animations: true });
		applyVisualTierClass();
		expect(glassClasses()).toEqual(['glass-full']);
	});
});

describe('noteVisualSettings', () => {
	it('drives the effective tier, policy and frame budget from one source', () => {
		const { tier, policy, frameBudgetMs } = useVisualTier();

		noteVisualSettings({ visualEffects: 'full', dataSaverMode: false, animations: false });
		expect(tier.value).toBe('full');
		expect(frameBudgetMs.value).toBe(TIER_FRAME_BUDGET_MS.full);
		expect(policy.value.ambient).toBe(false);

		noteVisualSettings({ visualEffects: 'full', dataSaverMode: true, animations: true });
		expect(tier.value).toBe('reduced');
		expect(frameBudgetMs.value).toBe(TIER_FRAME_BUDGET_MS.reduced);
	});

	it('carries the ambient-scenes switch into the shared policy without touching the tier', () => {
		const { tier, policy } = useVisualTier();

		noteVisualSettings({
			visualEffects: 'full',
			dataSaverMode: false,
			animations: true,
			ambientScenes: false
		});

		expect(tier.value).toBe('full');
		expect(policy.value.scenes).toBe(false);
		expect(policy.value.ambient).toBe(false);
		expect(policy.value.glass).toBe(true);
	});

	it('defaults both switches on for a caller that predates them', () => {
		const { policy } = useVisualTier();

		noteVisualSettings({ visualEffects: 'full', dataSaverMode: false, animations: true });
		expect(policy.value.scenes).toBe(true);
		expect(policy.value.glass).toBe(true);
	});
});

describe('recheckDevice', () => {
	it('measures, exposes the probe and persists a record it can read back', async () => {
		const { measuredTier, probe } = useVisualTier();
		const tier = await recheckDevice();

		expect(['full', 'reduced', 'off']).toContain(tier);
		expect(measuredTier.value).toBe(tier);
		expect(probe.value).not.toBeNull();

		const stored = parseStoredVisualTier(store.get(VISUAL_TIER_PREF_KEY) ?? null);
		expect(stored?.tier).toBe(tier);
		expect(stored?.measuredAt).toBeGreaterThan(0);
	});

	it('supersedes a session demotion, since it is a fresh measurement', async () => {
		const { measuredTier, demotedTier } = useVisualTier();
		measuredTier.value = 'full';
		demoteVisualTier(40);
		expect(demotedTier.value).toBe('reduced');

		await recheckDevice();
		expect(demotedTier.value).toBeNull();
	});
});

describe('initVisualTier', () => {
	it('hydrates a stored measurement for the running app version without re-probing', async () => {
		await recheckDevice();
		const seeded = store.get(VISUAL_TIER_PREF_KEY)!;
		const seededTier = parseStoredVisualTier(seeded)!.tier;

		resetVisualTierState();
		prefsSet.mockClear();

		const tier = await initVisualTier();
		expect(tier).toBe(seededTier);
		expect(useVisualTier().measuredTier.value).toBe(seededTier);
		expect(prefsSet).not.toHaveBeenCalled();
	});

	it('re-probes when the record came from a different app version', async () => {
		const stale: StoredVisualTier = {
			version: '0.0.1-stale',
			tier: 'full',
			probe: fakeProbe(),
			measuredAt: 1
		};
		store.set(VISUAL_TIER_PREF_KEY, JSON.stringify(stale));

		await initVisualTier();
		expect(prefsSet).toHaveBeenCalled();
		expect(parseStoredVisualTier(store.get(VISUAL_TIER_PREF_KEY) ?? null)?.version).not.toBe(
			stale.version
		);
	});

	it('runs the probe once no matter how many callers ask', async () => {
		const [a, b] = await Promise.all([initVisualTier(), initVisualTier()]);
		expect(a).toBe(b);
		expect(prefsSet).toHaveBeenCalledTimes(1);
	});
});

describe('demoteVisualTier', () => {
	it('steps down one tier at a time and then stops, never promoting', () => {
		const { measuredTier, demotedTier } = useVisualTier();
		measuredTier.value = 'full';

		expect(demoteVisualTier(30)).toBe('reduced');
		expect(demoteVisualTier(30)).toBe('off');
		expect(demoteVisualTier(30)).toBeNull();
		expect(demotedTier.value).toBe('off');
		expect(logWarn).toHaveBeenCalledTimes(2);
	});

	it('cannot demote past what was measured: a reduced device goes straight to off', () => {
		const { measuredTier } = useVisualTier();
		measuredTier.value = 'reduced';
		expect(demoteVisualTier(30)).toBe('off');
	});

	it('writes the demoted class immediately', () => {
		const { measuredTier } = useVisualTier();
		measuredTier.value = 'full';
		noteVisualSettings({ visualEffects: 'auto', dataSaverMode: false, animations: true });

		demoteVisualTier(30);
		expect(glassClasses()).toEqual(['glass-reduced']);
	});
});

describe('startVisualTierWatch', () => {
	function autoFull() {
		const handles = useVisualTier();
		handles.measuredTier.value = 'full';
		noteVisualSettings({ visualEffects: 'auto', dataSaverMode: false, animations: true });
		return handles;
	}

	// slow for `slowWindows` windows, then healthy again; makes each step observable without
	// racing the poll interval
	function slowThenFast(slowWindows: number) {
		let calls = 0;
		return async () => (++calls <= slowWindows ? [30, 31, 29, 30] : [8, 9, 8, 8]);
	}

	it('costs a tier only after two sustained slow windows', async () => {
		const { tier, demotedTier } = autoFull();
		const stop = startVisualTierWatch({ intervalMs: 1, windowFrames: 4, sample: slowThenFast(2) });

		try {
			await vi.waitFor(() => expect(demotedTier.value).toBe('reduced'), { timeout: 2_000 });
			// healthy windows follow, and the tier still does not come back
			await new Promise((resolve) => setTimeout(resolve, 60));
			expect(demotedTier.value).toBe('reduced');
			expect(tier.value).toBe('reduced');
		} finally {
			stop();
		}
	});

	it('keeps stepping down while it stays slow, then stops at off', async () => {
		const { tier, demotedTier } = autoFull();
		const stop = startVisualTierWatch({ intervalMs: 1, windowFrames: 4, sample: slowThenFast(4) });

		try {
			await vi.waitFor(() => expect(demotedTier.value).toBe('off'), { timeout: 2_000 });
			await new Promise((resolve) => setTimeout(resolve, 60));
			expect(demotedTier.value).toBe('off');
			expect(tier.value).toBe('off');
		} finally {
			stop();
		}
	});

	it('leaves a device that keeps up alone', async () => {
		const { demotedTier } = autoFull();
		const stop = startVisualTierWatch({
			intervalMs: 1,
			windowFrames: 4,
			sample: async () => [8, 9, 8, 8]
		});

		try {
			await new Promise((resolve) => setTimeout(resolve, 60));
			expect(demotedTier.value).toBeNull();
		} finally {
			stop();
		}
	});

	it('throws away a window the webview slept through instead of blaming the gpu', async () => {
		const { demotedTier } = autoFull();
		const stop = startVisualTierWatch({
			intervalMs: 1,
			windowFrames: 4,
			sample: async () => [400, 900]
		});

		try {
			await new Promise((resolve) => setTimeout(resolve, 60));
			expect(demotedTier.value).toBeNull();
		} finally {
			stop();
		}
	});

	it('does not sample at all when the tier is an explicit choice', async () => {
		autoFull();
		noteVisualSettings({ visualEffects: 'full', dataSaverMode: false, animations: true });
		const sample = vi.fn(async () => [30, 30, 30, 30]);
		const stop = startVisualTierWatch({ intervalMs: 1, windowFrames: 4, sample });

		try {
			await new Promise((resolve) => setTimeout(resolve, 40));
			expect(sample).not.toHaveBeenCalled();
		} finally {
			stop();
		}
	});

	it('is idempotent: a second start reuses the running watcher', () => {
		const first = startVisualTierWatch({ intervalMs: 1 });
		const second = startVisualTierWatch({ intervalMs: 1 });
		expect(second).toBe(first);
		first();
	});
});

describe('prefersReducedTransparency', () => {
	it('feature-detects the query instead of trusting a false match', () => {
		expect(typeof prefersReducedTransparency()).toBe('boolean');
	});
});
