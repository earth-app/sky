import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cap = vi.hoisted(() => ({ isNative: vi.fn(() => true) }));
const haptics = vi.hoisted(() => ({
	selectionChanged: vi.fn(async () => {}),
	impact: vi.fn(async () => {}),
	notification: vi.fn(async () => {})
}));
const play = vi.hoisted(() => vi.fn());

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: cap.isNative } }));

// keep the real ImpactStyle / NotificationType enums; asserting against a stubbed copy
// would only prove the stub agrees with itself
vi.mock('@capacitor/haptics', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	Haptics: haptics
}));

vi.mock('~/composables/useSoundEffects', () => ({ useSoundEffects: () => ({ play }) }));

import { ImpactStyle, NotificationType } from '@capacitor/haptics';
import { initQuestCelebrationListener, useAppHaptics } from '~/composables/useHaptics';
import { useAppSettingsState } from '~/composables/useSettings';

const stops: Array<() => void> = [];

function setHapticsEnabled(enabled: boolean) {
	useAppSettingsState().value.hapticFeedback = enabled;
}

beforeEach(() => {
	vi.clearAllMocks();
	cap.isNative.mockReturnValue(true);
	setHapticsEnabled(true);
});

afterEach(() => {
	while (stops.length) stops.pop()!();
	vi.useRealTimers();
});

describe('useAppHaptics style mapping', () => {
	it('maps each impact helper to its own ImpactStyle', async () => {
		const { impactLight, impactMedium, impactHeavy } = useAppHaptics();

		await impactLight();
		await impactMedium();
		await impactHeavy();

		expect(haptics.impact.mock.calls.map((c) => c[0])).toEqual([
			{ style: ImpactStyle.Light },
			{ style: ImpactStyle.Medium },
			{ style: ImpactStyle.Heavy }
		]);
	});

	it('maps each notify helper to its own NotificationType', async () => {
		const { notifySuccess, notifyWarning, notifyError } = useAppHaptics();

		await notifySuccess();
		await notifyWarning();
		await notifyError();

		expect(haptics.notification.mock.calls.map((c) => c[0])).toEqual([
			{ type: NotificationType.Success },
			{ type: NotificationType.Warning },
			{ type: NotificationType.Error }
		]);
	});

	it('uses selectionChanged for selection, never an impact', async () => {
		await useAppHaptics().selection();
		expect(haptics.selectionChanged).toHaveBeenCalledOnce();
		expect(haptics.impact).not.toHaveBeenCalled();
	});
});

describe('useAppHaptics gating', () => {
	it('is inert off-native', async () => {
		cap.isNative.mockReturnValue(false);
		const h = useAppHaptics();
		await Promise.all([h.selection(), h.impactLight(), h.notifySuccess()]);
		expect(haptics.selectionChanged).not.toHaveBeenCalled();
		expect(haptics.impact).not.toHaveBeenCalled();
		expect(haptics.notification).not.toHaveBeenCalled();
	});

	it('is inert when the user turned haptic feedback off', async () => {
		setHapticsEnabled(false);
		const h = useAppHaptics();
		await Promise.all([h.selection(), h.impactHeavy(), h.notifyError()]);
		expect(haptics.selectionChanged).not.toHaveBeenCalled();
		expect(haptics.impact).not.toHaveBeenCalled();
		expect(haptics.notification).not.toHaveBeenCalled();
	});

	it('swallows a plugin failure so a missing taptic engine cannot break a flow', async () => {
		haptics.impact.mockRejectedValue(new Error('no taptic engine'));
		await expect(useAppHaptics().impactLight()).resolves.toBeUndefined();
	});
});

describe('initQuestCelebrationListener', () => {
	async function celebrate() {
		const { triggerCelebration, closeCelebration } = useQuestCelebration();
		triggerCelebration({ title: 'Quest' } as never);
		await nextTick();
		return closeCelebration;
	}

	it('fires success then a delayed heavy impact and the celebration sfx', async () => {
		vi.useFakeTimers();
		stops.push(initQuestCelebrationListener());

		const close = await celebrate();
		expect(haptics.notification).toHaveBeenCalledWith({ type: NotificationType.Success });
		expect(play).toHaveBeenCalledWith('celebration');
		// the heavy thump is deliberately offset so it reads as a second beat, not a buzz
		expect(haptics.impact).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(80);
		expect(haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Heavy });
		close();
	});

	it('stays silent when the overlay closes', async () => {
		stops.push(initQuestCelebrationListener());
		const close = await celebrate();
		vi.clearAllMocks();

		close();
		await nextTick();
		expect(haptics.notification).not.toHaveBeenCalled();
		expect(play).not.toHaveBeenCalled();
	});

	it('replaces the previous listener instead of stacking a second one', async () => {
		initQuestCelebrationListener();
		stops.push(initQuestCelebrationListener());

		const close = await celebrate();
		expect(haptics.notification).toHaveBeenCalledOnce();
		expect(play).toHaveBeenCalledOnce();
		close();
	});

	it('stops firing after teardown', async () => {
		const stop = initQuestCelebrationListener();
		stop();

		const close = await celebrate();
		expect(haptics.notification).not.toHaveBeenCalled();
		expect(play).not.toHaveBeenCalled();
		close();
	});
});
