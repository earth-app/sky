import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

async function runHaptic(action: () => Promise<void>) {
	if (!Capacitor.isNativePlatform()) return;

	try {
		await action();
	} catch {
		// ignore haptics errors
	}
}

export function useAppHaptics() {
	const selection = () => runHaptic(() => Haptics.selectionChanged());

	const impactLight = () => runHaptic(() => Haptics.impact({ style: ImpactStyle.Light }));
	const impactMedium = () => runHaptic(() => Haptics.impact({ style: ImpactStyle.Medium }));
	const impactHeavy = () => runHaptic(() => Haptics.impact({ style: ImpactStyle.Heavy }));

	const notifySuccess = () =>
		runHaptic(() => Haptics.notification({ type: NotificationType.Success }));
	const notifyWarning = () =>
		runHaptic(() => Haptics.notification({ type: NotificationType.Warning }));
	const notifyError = () => runHaptic(() => Haptics.notification({ type: NotificationType.Error }));

	return {
		selection,
		impactLight,
		impactMedium,
		impactHeavy,
		notifySuccess,
		notifyWarning,
		notifyError
	};
}
