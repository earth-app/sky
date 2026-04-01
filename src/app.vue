<template>
	<IonApp>
		<div
			v-if="isOffline"
			class="fixed top-4 left-1/2 -translate-x-1/2 z-1000 pointer-events-none"
		>
			<div
				class="flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 text-white shadow-lg shadow-black/40"
			>
				<UIcon
					name="material-symbols:cloud-off-outline"
					class="size-5"
				/>
				<span class="font-medium text-sm">You're offline</span>
			</div>
		</div>
		<IonRouterOutlet :animation="slide" />
	</IonApp>
</template>

<script setup lang="ts">
import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Network, type ConnectionStatus } from '@capacitor/network';
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import slide from './animations/slide';
import {
	applyNetworkStatus,
	isOffline,
	setDataSaverModeEnabled,
	setOfflineModeEnabled
} from './composables/useNetwork';

if (import.meta.client) {
	defineCustomElements(window);
}

const config = useAppConfig();
const { fetchUser, user } = useAuth();
const { resolveDeepLink } = useDeepLinkRouting();
const { closeBrowser, clearFlow, refreshFlowState } = useMobileOAuth();
const { notifySuccess, notifyWarning } = useAppHaptics();
const { settings: appSettings, init: initSettings } = useAppSettings();

let networkListener: PluginListenerHandle | null = null;
let navHandler: (() => void) | null = null;
let stopUserCacheWatch: (() => void) | null = null;
let stopOfflineSettingWatch: (() => void) | null = null;
let stopDataSaverSettingWatch: (() => void) | null = null;

const handledDeepLinkTimestamps = new Map<string, number>();

let appUrlListener: PluginListenerHandle | null = null;
let browserFinishedListener: PluginListenerHandle | null = null;

useSeoMeta({
	charset: 'utf-8',
	title: config.name,
	themeColor: {
		content: config.themeColor,
		media: '(prefers-color-scheme: dark)'
	},
	mobileWebAppCapable: 'yes',
	appleMobileWebAppCapable: 'yes',
	appleMobileWebAppStatusBarStyle: 'black'
});

function shouldIgnoreDuplicateDeepLink(url: string) {
	const now = Date.now();
	const last = handledDeepLinkTimestamps.get(url) || 0;
	handledDeepLinkTimestamps.set(url, now);

	for (const [key, timestamp] of handledDeepLinkTimestamps.entries()) {
		if (now - timestamp > 30_000) {
			handledDeepLinkTimestamps.delete(key);
		}
	}

	return now - last < 1_500;
}

async function handleIncomingDeepLink(url: string) {
	if (!url || shouldIgnoreDuplicateDeepLink(url)) return;

	const resolved = resolveDeepLink(url);
	if (resolved.type === 'ignore') return;

	const flowState = refreshFlowState();
	if (flowState.active) {
		await closeBrowser();
		clearFlow();
		if (!isOffline.value) {
			await fetchUser(true);
		}
	}

	if (resolved.type === 'external') {
		await Browser.open({ url: resolved.target });
		return;
	}

	await navigateTo(resolved.target, { replace: true });
}

async function handleAppUrlOpen(event: URLOpenListenerEvent) {
	await handleIncomingDeepLink(event.url);
}

onMounted(async () => {
	await initSettings();

	stopOfflineSettingWatch = watch(
		() => appSettings.value.offlineMode,
		(value) => {
			setOfflineModeEnabled(Boolean(value));
		},
		{ immediate: true }
	);

	stopDataSaverSettingWatch = watch(
		() => appSettings.value.dataSaverMode,
		(value) => {
			setDataSaverModeEnabled(Boolean(value));
		},
		{ immediate: true }
	);

	if (Capacitor.isNativePlatform()) {
		const initialStatus = await Network.getStatus();
		applyNetworkStatus(initialStatus);
	} else if (import.meta.client) {
		applyNetworkStatus({
			connected: navigator.onLine,
			connectionType: navigator.onLine ? 'unknown' : 'none'
		});
	}

	if (!isOffline.value) {
		await fetchUser();
	}

	// On client, persist authenticated user for offline fallback whenever it changes.
	if (import.meta.client && !stopUserCacheWatch) {
		stopUserCacheWatch = watch(
			() => user.value,
			(newUser) => {
				if (newUser) {
					void saveCachedUser(newUser).catch(() => {});
				}
			},
			{ immediate: true }
		);
	}

	if (Capacitor.isNativePlatform()) {
		const updateFromStatus = async (s: ConnectionStatus) => {
			const wasOffline = isOffline.value;
			applyNetworkStatus(s);

			if (!wasOffline && isOffline.value) await notifyWarning();
			if (wasOffline && !isOffline.value) await notifySuccess();
		};

		await updateFromStatus(await Network.getStatus());
		networkListener = await Network.addListener('networkStatusChange', updateFromStatus);

		appUrlListener = await App.addListener('appUrlOpen', handleAppUrlOpen);
		browserFinishedListener = await Browser.addListener('browserFinished', async () => {
			const flowState = refreshFlowState();
			if (!flowState.active) return;

			clearFlow();
			if (!isOffline.value) {
				await fetchUser(true);
			}
		});

		const launchUrl = await App.getLaunchUrl();
		if (launchUrl?.url) {
			await handleIncomingDeepLink(launchUrl.url);
		}
		return;
	}

	// Browser fallback
	const updateFromNavigator = async () => {
		const wasOffline = isOffline.value;
		applyNetworkStatus({
			connected: navigator.onLine,
			connectionType: navigator.onLine ? 'unknown' : 'none'
		});

		if (!wasOffline && isOffline.value) await notifyWarning();
		if (wasOffline && !isOffline.value) await notifySuccess();
	};

	updateFromNavigator();
	window.addEventListener('online', updateFromNavigator);
	window.addEventListener('offline', updateFromNavigator);
	navHandler = updateFromNavigator;
});

onBeforeUnmount(() => {
	appUrlListener?.remove();
	browserFinishedListener?.remove();
	stopUserCacheWatch?.();
	stopOfflineSettingWatch?.();
	stopDataSaverSettingWatch?.();

	networkListener?.remove();
	networkListener = null;
	stopUserCacheWatch = null;
	stopOfflineSettingWatch = null;
	stopDataSaverSettingWatch = null;

	if (navHandler) {
		window.removeEventListener('online', navHandler);
		window.removeEventListener('offline', navHandler);
		navHandler = null;
	}

	appUrlListener = null;
	browserFinishedListener = null;
});
</script>
