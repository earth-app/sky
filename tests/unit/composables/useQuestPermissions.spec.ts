import { beforeEach, describe, expect, it, vi } from 'vitest';

const camera = vi.hoisted(() => ({
	checkPermissions: vi.fn(),
	requestPermissions: vi.fn()
}));
const dialog = vi.hoisted(() => ({ alert: vi.fn(), confirm: vi.fn() }));
const toast = vi.hoisted(() => ({ show: vi.fn() }));
const pedometer = vi.hoisted(() => ({
	checkPermissions: vi.fn(),
	requestPermissions: vi.fn()
}));
const ensureLocationGranted = vi.hoisted(() => vi.fn());
const cap = vi.hoisted(() => ({ platform: vi.fn(() => 'ios') }));

vi.mock('@capacitor/camera', () => ({ Camera: camera }));
vi.mock('@capacitor/dialog', () => ({ Dialog: dialog }));
vi.mock('@capacitor/toast', () => ({ Toast: toast }));
vi.mock('@capgo/capacitor-pedometer', () => ({ CapacitorPedometer: pedometer }));
vi.mock('@capacitor/core', () => ({
	Capacitor: { getPlatform: cap.platform, isNativePlatform: () => true },
	// useHealthKit registers a native plugin at import time
	registerPlugin: () => ({})
}));
vi.mock('~/composables/useMGeolocation', () => ({
	useMGeolocation: () => ({ ensureLocationGranted })
}));

import { isCameraCancelError, useQuestPermissions } from '~/composables/useQuestPermissions';

const getUserMedia = vi.fn();
const stopTrack = vi.fn();

beforeEach(() => {
	vi.clearAllMocks();
	cap.platform.mockReturnValue('ios');
	camera.checkPermissions.mockResolvedValue({ camera: 'granted' });
	camera.requestPermissions.mockResolvedValue({ camera: 'granted' });
	dialog.alert.mockResolvedValue(undefined);
	toast.show.mockResolvedValue(undefined);
	pedometer.checkPermissions.mockResolvedValue({ activityRecognition: 'granted' });
	pedometer.requestPermissions.mockResolvedValue({ activityRecognition: 'granted' });
	ensureLocationGranted.mockResolvedValue(true);
	getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
	vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('isCameraCancelError', () => {
	it('recognises the OutSystems camera cancel codes', () => {
		expect(isCameraCancelError({ code: 'OS-PLUG-CAMR-0006' })).toBe(true);
		expect(isCameraCancelError({ code: 'OS-PLUG-CAMR-0020' })).toBe(true);
	});

	it('recognises every cancel spelling in the message, whatever the case', () => {
		expect(isCameraCancelError(new Error('User cancelled photos app'))).toBe(true);
		expect(isCameraCancelError(new Error('The operation was CANCELED'))).toBe(true);
		expect(isCameraCancelError('User cancel')).toBe(true);
	});

	it('does not classify a real camera failure or an absent error as a refusal', () => {
		expect(isCameraCancelError(new Error('Camera is unavailable'))).toBe(false);
		expect(isCameraCancelError({ code: 'OS-PLUG-CAMR-0001' })).toBe(false);
		expect(isCameraCancelError(null)).toBe(false);
		expect(isCameraCancelError(undefined)).toBe(false);
		expect(isCameraCancelError('')).toBe(false);
	});
});

describe('camera permission', () => {
	it('accepts an existing grant without prompting', async () => {
		expect(await useQuestPermissions().ensure('camera')).toBe(true);
		expect(camera.requestPermissions).not.toHaveBeenCalled();
	});

	it('requests only the camera permission and honours a denial', async () => {
		camera.checkPermissions.mockResolvedValue({ camera: 'prompt' });
		camera.requestPermissions.mockResolvedValue({ camera: 'denied' });

		expect(await useQuestPermissions().ensure('camera')).toBe(false);
		expect(camera.requestPermissions).toHaveBeenCalledWith({ permissions: ['camera'] });
	});

	it('is false rather than throwing when the plugin blows up', async () => {
		camera.checkPermissions.mockRejectedValue(new Error('no camera bridge'));
		expect(await useQuestPermissions().ensure('camera')).toBe(false);
	});

	it('is denied for a limited grant that cannot capture', async () => {
		camera.checkPermissions.mockResolvedValue({ camera: 'limited' });
		camera.requestPermissions.mockResolvedValue({ camera: 'limited' });
		expect(await useQuestPermissions().ensure('camera')).toBe(false);
	});
});

describe('microphone permission', () => {
	it('releases the probe stream so the mic indicator does not stay lit', async () => {
		expect(await useQuestPermissions().ensure('record')).toBe(true);
		expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
		expect(stopTrack).toHaveBeenCalledOnce();
	});

	it('is false when the user blocks the mic', async () => {
		getUserMedia.mockRejectedValue(new Error('NotAllowedError'));
		expect(await useQuestPermissions().ensure('record')).toBe(false);
	});
});

describe('location permission', () => {
	it('routes through the sole geolocation owner', async () => {
		expect(await useQuestPermissions().ensure('location')).toBe(true);
		expect(ensureLocationGranted).toHaveBeenCalledOnce();
	});

	it('is false when the geolocation owner throws', async () => {
		ensureLocationGranted.mockRejectedValue(new Error('permissions api unavailable'));
		expect(await useQuestPermissions().ensure('location')).toBe(false);
	});
});

describe('notifyDenied', () => {
	it('names the permission and points at device settings', async () => {
		await useQuestPermissions().notifyDenied('camera');
		expect(dialog.alert).toHaveBeenCalledWith({
			title: 'Camera Access Needed',
			message: expect.stringContaining('take photos for this quest step'),
			buttonTitle: 'OK'
		});
		expect(dialog.alert.mock.calls[0]![0].message).toContain('device settings');
		expect(toast.show).not.toHaveBeenCalled();
	});

	it('uses the microphone label for record steps', async () => {
		await useQuestPermissions().notifyDenied('record');
		expect(dialog.alert.mock.calls[0]![0].title).toBe('Microphone Access Needed');
	});

	it('falls back to a toast where the dialog plugin is missing', async () => {
		dialog.alert.mockRejectedValue(new Error('not implemented on web'));
		await useQuestPermissions().notifyDenied('location');
		expect(toast.show).toHaveBeenCalledWith({
			text: expect.stringContaining('Location access is required'),
			duration: 'long'
		});
	});

	it('stays silent rather than throwing when neither surface works', async () => {
		dialog.alert.mockRejectedValue(new Error('no dialog'));
		toast.show.mockRejectedValue(new Error('no toast'));
		await expect(useQuestPermissions().notifyDenied('camera')).resolves.toBeUndefined();
	});
});

describe('require', () => {
	it('surfaces the denial dialog and halts the flow', async () => {
		camera.checkPermissions.mockResolvedValue({ camera: 'denied' });
		camera.requestPermissions.mockResolvedValue({ camera: 'denied' });

		expect(await useQuestPermissions().require('camera')).toBe(false);
		expect(dialog.alert).toHaveBeenCalledOnce();
	});

	it('suppresses the dialog when the caller owns the messaging', async () => {
		camera.checkPermissions.mockResolvedValue({ camera: 'denied' });
		camera.requestPermissions.mockResolvedValue({ camera: 'denied' });

		expect(await useQuestPermissions().require('camera', { notify: false })).toBe(false);
		expect(dialog.alert).not.toHaveBeenCalled();
	});

	it('never nags on a grant', async () => {
		expect(await useQuestPermissions().require('camera')).toBe(true);
		expect(dialog.alert).not.toHaveBeenCalled();
	});
});

describe('prime', () => {
	it('reuses the plain check for camera, record and location', async () => {
		const permissions = useQuestPermissions();
		expect(await permissions.prime('camera')).toBe(true);
		expect(await permissions.prime('record')).toBe(true);
		expect(await permissions.prime('location')).toBe(true);
		expect(dialog.alert).not.toHaveBeenCalled();
	});
});

describe('labels', () => {
	it('exposes a user-facing label for every quest permission', () => {
		expect(useQuestPermissions().labels).toEqual({
			camera: 'Camera',
			location: 'Location',
			record: 'Microphone',
			motion: 'Motion & Fitness',
			healthkit: 'Apple Health'
		});
	});
});
