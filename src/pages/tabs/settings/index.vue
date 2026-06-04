<template>
	<IonPage>
		<IonHeader class="ion-no-border">
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>

				<IonTitle id="settings">Settings</IonTitle>

				<IonButtons
					slot="end"
					class="mr-2"
				>
					<IonButton
						color="primary"
						router-link="/tabs/profile/editor"
						class="size-8"
					>
						<UIcon
							name="mdi:account-edit"
							class="min-h-6 min-w-6"
						/>
					</IonButton>
				</IonButtons>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<div class="flex flex-col w-full items-center px-4 mb-8">
				<div
					v-for="setting in settingSections"
					:key="setting.section"
					class="flex flex-col items-center w-full px-4"
				>
					<h2
						:id="setting.section === 'Notifications' ? 'notifications' : undefined"
						class="text-lg! my-4 text-center font-semibold"
					>
						{{ setting.section }}
					</h2>
					<IonList class="w-full rounded-xl border-2 border-black/40 light:border-gray-300">
						<IonItem
							v-for="item in setting.items"
							:key="`${setting.section}-${item.title}`"
						>
							<div class="flex flex-col w-full my-1">
								<IonSelect
									v-if="item.kind === 'select'"
									:label="item.title"
									:aria-label="item.title"
									label-placement="fixed"
									:placeholder="item.placeholder"
									interface="popover"
									:model-value="appSettings[item.key]"
									@ionChange="onSelectChange(item.key, $event)"
								>
									<IonSelectOption
										v-for="option in item.options"
										:key="option.value"
										:value="option.value"
									>
										{{ option.label }}
									</IonSelectOption>
								</IonSelect>
								<IonToggle
									v-else-if="item.kind === 'toggle'"
									color="tertiary"
									:checked="Boolean(appSettings[item.key])"
									@ionChange="onToggleChange(item.key, $event)"
								>
									{{ item.title }}
								</IonToggle>
								<div
									v-else-if="item.kind === 'action'"
									class="flex justify-between mb-1"
								>
									<IonLabel>{{ item.title }}</IonLabel>
									<IonButton
										@click="runAction(item)"
										:color="item.color || 'secondary'"
										size="small"
										:disabled="Boolean(actionLoading[item.title])"
									>
										{{ actionLoading[item.title] ? 'Working...' : item.placeholder }}
									</IonButton>
								</div>
								<div
									v-else-if="item.kind === 'link'"
									class="flex justify-between mb-1"
								>
									<IonLabel>{{ item.title }}</IonLabel>
									<IonButton
										:router-link="item.link"
										fill="clear"
										:color="item.color || 'secondary'"
										size="small"
									>
										<UIcon
											name="mdi:arrow-right"
											:aria-label="item.placeholder"
											:title="item.placeholder"
											class="min-h-6 min-w-6"
										/>
									</IonButton>
								</div>

								<span class="text-xs opacity-80 mb-1 text-wrap max-w-7/8">{{
									item.description
								}}</span>
							</div>
						</IonItem>
					</IonList>
				</div>

				<div class="flex flex-col items-center">
					<h2 class="text-lg! my-4 text-center font-semibold">App Metadata</h2>
					<div class="flex items-center justify-center opacity-80 px-8">
						<IonText class="flex flex-col gap-1 text-xs text-center">
							<p>{{ mode }}</p>
							<p>{{ url }}</p>
							<p>@earth-app/sky v{{ version }}</p>
							<h3 class="text-sm! m-0!">Dependencies</h3>
							<ul class="list-disc list-inside text-start">
								<li
									v-for="(depVersion, name) in dependencies"
									:key="name"
								>
									{{ name }}: {{ depVersion }}
								</li>
							</ul>
							<h3 class="text-sm! m-0!">Dev Dependencies</h3>
							<ul class="list-disc list-inside text-start">
								<li
									v-for="(depVersion, name) in devDependencies"
									:key="name"
								>
									{{ name }}: {{ depVersion }}
								</li>
							</ul>
						</IonText>
					</div>
				</div>
			</div>

			<div class="flex items-center justify-center text-sm! w-full px-6 mb-4">
				<img
					src="/earth-app.png"
					class="size-6 mr-2"
				/>
				<span>Created by Gregory Mitchell with ❤️</span>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Dialog } from '@capacitor/dialog';
import { Geolocation } from '@capacitor/geolocation';
import { PushNotifications } from '@capacitor/push-notifications';
import { Share } from '@capacitor/share';
import { Toast } from '@capacitor/toast';
import type { OAuthProvider } from 'types/user';
import { capitalizeFully } from 'utils';
import {
	isAppleNativeAvailable,
	isAppleNativeUnavailableError,
	startAppleNativeAuth
} from '~/composables/useAppleNativeAuth';
import type { AppSettingKey } from '~/composables/useSettings';

declare const __APP_VERSION__: string;
declare const __DEPS__: string;
declare const __DEV_DEPS__: string;

const mode = import.meta.env.MODE;
const url = import.meta.url;
const version = __APP_VERSION__;
const dependencies = computed<Record<string, string>>(() => {
	if (typeof __DEPS__ === 'object' && __DEPS__) {
		return __DEPS__ as unknown as Record<string, string>;
	}

	try {
		return JSON.parse(__DEPS__) as Record<string, string>;
	} catch {
		return {};
	}
});
const devDependencies = computed<Record<string, string>>(() => {
	if (typeof __DEV_DEPS__ === 'object' && __DEV_DEPS__) {
		return __DEV_DEPS__ as unknown as Record<string, string>;
	}

	try {
		return JSON.parse(__DEV_DEPS__) as Record<string, string>;
	} catch {
		return {};
	}
});

type SelectOption = {
	label: string;
	value: string;
};

type SelectSettingItem = {
	kind: 'select';
	key: AppSettingKey;
	title: string;
	description: string;
	placeholder: string;
	options: SelectOption[];
};

type ToggleSettingItem = {
	kind: 'toggle';
	key: AppSettingKey;
	title: string;
	description: string;
	placeholder: string;
};

type ActionSettingItem = {
	kind: 'action';
	title: string;
	description: string;
	placeholder: string;
	color?: string;
	action: () => Promise<void> | void;
};

type LinkSettingItem = {
	kind: 'link';
	title: string;
	description: string;
	placeholder: string;
	color?: string;
	link: string;
};

type SettingSection = {
	section: string;
	items: (SelectSettingItem | ToggleSettingItem | ActionSettingItem | LinkSettingItem)[];
};

const { settings: appSettings, init: initSettings, setValue, resetToDefaults } = useAppSettings();
const { selection, impactLight, impactMedium, notifySuccess, notifyWarning, notifyError } =
	useAppHaptics();
const { user: authUser, fetchUser } = useAuth();
const { isNative, beginFlow } = useMobileOAuth();
const authStore = useAuthStore();
const config = useRuntimeConfig();
const downloads = useDownloads();
const router = useIonRouter();
const actionLoading = reactive<Record<string, boolean>>({});

function isProviderLinked(provider: OAuthProvider): boolean {
	return Boolean(authUser.value?.account?.linked_providers?.includes(provider));
}

async function connectProvider(provider: OAuthProvider) {
	try {
		await impactLight();

		if (provider === 'apple' && isAppleNativeAvailable()) {
			try {
				await startAppleNativeAuth('link');
				await fetchUser(true);
				notifySuccess();
				await Toast.show({
					text: 'Apple account connected.',
					duration: 'short'
				});
				return;
			} catch (error) {
				// Plugin JS shim is present but native side isn't linked yet — fall
				// through to the browser flow so the user can still connect Apple.
				if (!isAppleNativeUnavailableError(error)) {
					throw error;
				}
				console.warn(
					'Native Apple Sign In is not available in this build; falling back to browser flow.'
				);
			}
		}

		// Pass source='mobile' so crust's callback parses the state's second
		// segment as 'mobile' (not 'web') and honors the 4th-segment session
		// token that applyMobileOAuthState appends for native link flows.
		const authUrl = authLink(provider, 'link', 'mobile');
		await beginFlow(authUrl, 'link', provider);
	} catch (error) {
		notifyError();
		await showErrorToast(error, {
			fallback: `Failed to connect ${capitalizeFully(provider)}.`
		});
	}
}

async function disconnectProvider(provider: OAuthProvider) {
	const linkedCount = authUser.value?.account?.linked_providers?.length || 0;
	if (!authUser.value?.account?.has_password && linkedCount <= 1) {
		notifyWarning();
		await Toast.show({
			text: 'You cannot disconnect your only authentication method. Set a password first.',
			duration: 'long'
		});
		return;
	}

	const confirmed = await Dialog.confirm({
		title: `Disconnect ${capitalizeFully(provider)}`,
		message: `Are you sure you want to disconnect your ${capitalizeFully(provider)} account?`
	});
	if (!confirmed.value) {
		notifyWarning();
		return;
	}

	try {
		await impactMedium();
		const unlinkUrl = new URL('/api/auth/unlink-callback', config.public.baseUrl);
		unlinkUrl.searchParams.set('provider', provider);
		// The SafariViewController cookie jar doesn't share with the app's
		// localStorage-based auth, so on native we surface the session token in
		// the URL so crust's unlink-callback can authenticate the request.
		if (isNative && authStore.sessionToken) {
			unlinkUrl.searchParams.set('session_token', authStore.sessionToken);
		}
		await beginFlow(unlinkUrl.toString(), 'unlink', provider);
	} catch (error) {
		notifyError();
		await showErrorToast(error, {
			fallback: `Failed to disconnect ${capitalizeFully(provider)}.`
		});
	}
}

const oauth2Items = computed<SettingSection['items']>(() =>
	OAUTH_PROVIDERS.map((provider) => {
		const linked = isProviderLinked(provider);
		return {
			kind: 'action' as const,
			title: `${capitalizeFully(provider)}${linked ? ' (Connected)' : ''}`,
			description: linked
				? `Disconnect your ${capitalizeFully(provider)} account from this app`
				: `Connect your ${capitalizeFully(provider)} account to this app`,
			placeholder: linked ? 'Disconnect' : 'Connect',
			color: linked ? 'danger' : 'tertiary',
			action: () => (linked ? disconnectProvider(provider) : connectProvider(provider))
		};
	})
);

async function clearCacheAction() {
	if (import.meta.client && typeof caches !== 'undefined') {
		const cacheKeys = await caches.keys();
		await Promise.all(
			cacheKeys.filter((key) => key !== 'downloads').map((key) => caches.delete(key))
		);
	}

	notifySuccess();
	await Toast.show({
		text: 'Cache cleared.',
		duration: 'short'
	});
}

async function deleteAllDownloadsAction() {
	const allDownloads = await downloads.all();
	for (const item of allDownloads) {
		if (!item?.id || !item?.type) continue;
		await downloads.remove(item.type, item.id);
	}

	notifySuccess();
	await Toast.show({
		text: 'All downloads deleted.',
		duration: 'short'
	});
}

async function restoreDefaultsAction() {
	await resetToDefaults();

	notifySuccess();
	await Toast.show({
		text: 'Settings restored to defaults.',
		duration: 'short'
	});
}

async function exportLogsAction() {
	const logger = useLogger();
	const result = await logger.exportLogs();

	if (Capacitor.isNativePlatform() && result.uri) {
		try {
			await Share.share({
				url: result.uri,
				title: 'App Logs',
				dialogTitle: 'Export Logs'
			});
			await showInfoToast('Logs Shared');
			return;
		} catch (err) {
			// share sheet cancel throws — treat as a silent no-op
			const message = err instanceof Error ? err.message : String(err);
			if (/cancel/i.test(message)) return;
			await showInfoToast(`Logs Saved To ${result.uri}`);
			return;
		}
	}

	// web fallback — trigger a blob download
	if (typeof document !== 'undefined') {
		const blob = new Blob([result.text], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `sky-logs-${Date.now()}.txt`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		await showInfoToast('Logs Downloaded');
	}
}

async function clearLogsAction() {
	const confirmed = await Dialog.confirm({
		title: 'Clear Logs',
		message: 'This will erase all local log files. Continue?'
	});
	if (!confirmed.value) {
		notifyWarning();
		return;
	}

	await useLogger().clearLogs();
	notifySuccess();
	await showInfoToast('Logs Cleared');
}

const settingSections = computed<SettingSection[]>(() => [
	{
		section: 'Appearence',
		items: [
			{
				kind: 'select',
				key: 'theme',
				title: 'Theme',
				description: 'Choose between light, dark, or system theme',
				placeholder: 'Select theme',
				options: [
					{ label: 'System', value: 'system' },
					{ label: 'Light', value: 'light' },
					{ label: 'Dark', value: 'dark' }
				]
			},
			{
				kind: 'select',
				key: 'scale',
				title: 'Scale',
				description: 'Adjust the overall UI scale for better readability or more content on screen',
				placeholder: 'Select UI scale',
				options: [
					{ label: 'Extra Small', value: '0.6' },
					{ label: 'Small', value: '0.8' },
					{ label: 'Normal', value: '1' },
					{ label: 'Large', value: '1.2' },
					{ label: 'Extra Large', value: '1.5' }
				]
			},
			{
				kind: 'select',
				key: 'font',
				title: 'Font',
				description: 'Choose your preferred font for the app interface',
				placeholder: 'Select font',
				options: [
					{ label: 'System', value: 'system' },
					{ label: 'Inter', value: 'inter' },
					{ label: 'Roboto', value: 'roboto' },
					{ label: 'Times New Roman', value: 'times-new-roman' },
					{ label: 'Open Sans', value: 'open-sans' },
					{ label: 'Noto Sans', value: 'noto-sans' },
					{ label: 'Segoe UI', value: 'segoe-ui' }
				]
			},
			{
				kind: 'toggle',
				key: 'cardThumbnails',
				title: 'Card Thumbnails',
				description: 'Show thumbnails on content cards for a more visual experience',
				placeholder: 'Show thumbnails'
			},
			{
				kind: 'toggle',
				key: 'animations',
				title: 'Animations',
				description:
					'Toggle UI animations and transitions for a more dynamic or instant experience',
				placeholder: 'Enable animations and transitions'
			}
		]
	},
	{
		section: 'Notifications',
		items: [
			{
				kind: 'toggle',
				key: 'pushNotifications',
				title: 'Push Notifications',
				description:
					'Whether notifications from the app should be pushed to your device (requires permission)',
				placeholder: 'Enable push notifications'
			},
			{
				kind: 'toggle',
				key: 'hapticFeedback',
				title: 'Haptic Feedback',
				description:
					'Enable subtle vibrations for certain interactions to enhance the tactile experience',
				placeholder: 'Enable haptic feedback'
			},
			{
				kind: 'toggle',
				key: 'soundEffects',
				title: 'Sound Effects',
				description:
					'Play a short tone on quest completion and other key UI moments. Off by default.',
				placeholder: 'Enable sound effects'
			}
		]
	},
	{
		section: 'Performance',
		items: [
			{
				kind: 'toggle',
				key: 'dataSaverMode',
				title: 'Data Saver Mode',
				description:
					'Reduce data usage by disabling certain features or using lower-quality media when not on Wi-Fi',
				placeholder: 'Enable data saver mode'
			},
			{
				kind: 'toggle',
				key: 'preloadContent',
				title: 'Preload Content',
				description:
					'Preload images and media for a smoother experience at the cost of increased data usage',
				placeholder: 'Enable content preloading'
			},
			{
				kind: 'toggle',
				key: 'offlineMode',
				title: 'Offline Mode',
				description: 'Only access downloaded content and disable all network requests',
				placeholder: 'Enable offline mode'
			},
			{
				kind: 'action',
				title: 'Clear Cache',
				description: 'Free up storage space by clearing cached data and media',
				placeholder: 'Clear',
				color: 'secondary',
				action: clearCacheAction
			},
			{
				kind: 'link',
				title: 'View Downloads',
				description: 'See all downloaded content',
				placeholder: 'View',
				color: 'primary',
				link: '/tabs/downloads'
			},
			{
				kind: 'action',
				title: 'Delete All Downloads',
				description: 'Permanently delete all downloaded content from this app',
				placeholder: 'Delete',
				color: 'danger',
				action: deleteAllDownloadsAction
			}
		]
	},
	{
		section: 'OAuth Connections',
		items: oauth2Items.value
	},
	{
		section: 'Account',
		items: [
			{
				kind: 'link',
				title: 'API Keys',
				description:
					'Generate, view, and revoke API keys for scripts or third-party tools acting on your behalf',
				placeholder: 'Manage',
				color: 'primary',
				link: '/tabs/settings/api-keys'
			}
		]
	},
	{
		section: 'Other',
		items: [
			{
				kind: 'action',
				title: 'Location Permissions',
				description:
					'Allow the app to access your location for more relevant content and features (requires permission)',
				placeholder: 'Request',
				color: 'secondary',
				action: async () => {
					try {
						await Geolocation.requestPermissions();
					} catch (error) {
						await Toast.show({
							text: `${error instanceof Error ? error.message : 'Failed to request location permissions'}`,
							duration: 'short'
						});
					}
				}
			},
			{
				kind: 'action',
				title: 'Submit Feedback',
				description: 'Report bugs or suggest features to help improve the app',
				placeholder: 'Submit',
				color: 'primary',
				action: async () => {
					await Browser.open({
						url: 'https://github.com/earth-app/sky/issues/new/choose'
					});
				}
			},
			{
				kind: 'action',
				title: 'Donate',
				description: 'Support development by making a donation',
				placeholder: 'Donate',
				color: 'tertiary',
				action: async () => {
					await Browser.open({
						url: 'https://patreon.com/gmitch215'
					});
				}
			},
			{
				kind: 'action',
				title: 'Terms of Service',
				description: 'Read the app terms of service',
				placeholder: 'View',
				color: 'medium',
				action: async () => {
					await Browser.open({
						url: 'https://earth-app.com/tos'
					});
				}
			},
			{
				kind: 'action',
				title: 'Privacy Policy',
				description: 'Read the app privacy policy',
				placeholder: 'View',
				color: 'medium',
				action: async () => {
					await Browser.open({
						url: 'https://earth-app.com/privacy-policy'
					});
				}
			},
			{
				kind: 'action',
				title: 'Log Out',
				description: 'Sign out of your account',
				placeholder: 'Log Out',
				color: 'danger',
				action: logout
			},
			{
				kind: 'action',
				title: 'Restore Defaults',
				description: 'Reset all settings to their default values',
				placeholder: 'Restore',
				color: 'danger',
				action: restoreDefaultsAction
			},
			{
				kind: 'action',
				title: 'Export Logs',
				description: 'Share recent app logs for debugging',
				placeholder: 'Export',
				color: 'primary',
				action: exportLogsAction
			},
			{
				kind: 'action',
				title: 'Clear Logs',
				description: 'Erase all local log files before reproducing a bug',
				placeholder: 'Clear',
				color: 'danger',
				action: clearLogsAction
			}
		]
	}
]);

async function onSelectChange(key: AppSettingKey, event: CustomEvent) {
	await setValue(key, String(event.detail?.value ?? appSettings.value[key]) as any);
	selection();
}

async function onToggleChange(key: AppSettingKey, event: CustomEvent) {
	const checked = Boolean(event.detail?.checked);
	if (key === 'pushNotifications' && checked) {
		const status = await PushNotifications.checkPermissions();
		if (status.receive === 'denied') {
			await setValue(key, false);
			await Toast.show({
				text: 'Permission was denied for Push Notifications.',
				duration: 'long'
			});
			return;
		} else {
			await Toast.show({
				text: 'Push Notifications enabled!',
				duration: 'short'
			});
		}
	}

	await setValue(key, checked as any);
	selection();
}

async function runAction(item: ActionSettingItem) {
	actionLoading[item.title] = true;

	try {
		await item.action();
		notifySuccess();
	} catch (error) {
		notifyError();
		await Toast.show({
			text: `${error instanceof Error ? error.message : 'An error occurred while performing this action.'}`,
			duration: 'short'
		});
	} finally {
		actionLoading[item.title] = false;
	}
}

async function logout() {
	const logout = useLogout();
	logout(Capacitor.getPlatform());
	router.navigate('/login', 'root', 'replace');
}

onMounted(async () => {
	await initSettings();
});
</script>
