<template>
	<IonApp>
		<div
			v-if="isOffline"
			class="fixed top-4 left-1/2 -translate-x-1/2 z-1000 pointer-events-none"
		>
			<div
				class="flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 text-white shadow-lg shadow-black/40"
			>
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

if (import.meta.client) {
	defineCustomElements(window);
}

const config = useAppConfig();
const { fetchUser } = useAuth();
const { resolveDeepLink } = useDeepLinkRouting();
const { closeBrowser, clearFlow, refreshFlowState } = useMobileOAuth();
const { notifySuccess, notifyWarning } = useAppHaptics();

const isOffline = ref(false);
const handledDeepLinkTimestamps = new Map<string, number>();

let appUrlListener: PluginListenerHandle | null = null;
let networkListener: PluginListenerHandle | null = null;
let browserFinishedListener: PluginListenerHandle | null = null;

let removeOnlineListener: (() => void) | null = null;
let removeOfflineListener: (() => void) | null = null;

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

async function updateOfflineState(status: ConnectionStatus) {
	const wasOffline = isOffline.value;
	isOffline.value = !status.connected;

	if (!wasOffline && isOffline.value) {
		await notifyWarning();
	}

	if (wasOffline && !isOffline.value) {
		await notifySuccess();
	}
}

async function handleIncomingDeepLink(url: string) {
	if (!url || shouldIgnoreDuplicateDeepLink(url)) return;

	const resolved = resolveDeepLink(url);
	if (resolved.type === 'ignore') return;

	const flowState = refreshFlowState();
	if (flowState.active) {
		await closeBrowser();
		clearFlow();
		await fetchUser(true);
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
	await fetchUser();

	if (Capacitor.isNativePlatform()) {
		await updateOfflineState(await Network.getStatus());

		appUrlListener = await App.addListener('appUrlOpen', handleAppUrlOpen);
		networkListener = await Network.addListener('networkStatusChange', updateOfflineState);
		browserFinishedListener = await Browser.addListener('browserFinished', async () => {
			const flowState = refreshFlowState();
			if (!flowState.active) return;

			clearFlow();
			await fetchUser(true);
		});

		const launchUrl = await App.getLaunchUrl();
		if (launchUrl?.url) {
			await handleIncomingDeepLink(launchUrl.url);
		}
		return;
	}

	const updateFromNavigator = () => {
		isOffline.value = !navigator.onLine;
	};

	updateFromNavigator();
	window.addEventListener('online', updateFromNavigator);
	window.addEventListener('offline', updateFromNavigator);

	removeOnlineListener = () => window.removeEventListener('online', updateFromNavigator);
	removeOfflineListener = () => window.removeEventListener('offline', updateFromNavigator);
});

onBeforeUnmount(() => {
	appUrlListener?.remove();
	networkListener?.remove();
	browserFinishedListener?.remove();

	appUrlListener = null;
	networkListener = null;
	browserFinishedListener = null;

	removeOnlineListener?.();
	removeOfflineListener?.();
	removeOnlineListener = null;
	removeOfflineListener = null;
});
</script>
