<template>
	<IonPage>
		<IonHeader class="ion-no-border">
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>

				<IonTitle>Settings</IonTitle>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<div class="flex flex-col w-full items-center px-4 mb-8">
				<div
					v-for="setting in settingSections"
					:key="setting.section"
					class="flex flex-col items-center w-full px-4"
				>
					<h2 class="text-lg! my-4 text-center font-semibold">{{ setting.section }}</h2>
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
import { Geolocation } from '@capacitor/geolocation';
import { Toast } from '@capacitor/toast';
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

type SettingSection = {
	section: string;
	items: (SelectSettingItem | ToggleSettingItem | ActionSettingItem)[];
};

const { settings: appSettings, init: initSettings, setValue, resetToDefaults } = useAppSettings();
const downloads = useDownloads();
const actionLoading = reactive<Record<string, boolean>>({});

async function clearCacheAction() {
	if (import.meta.client && typeof caches !== 'undefined') {
		const cacheKeys = await caches.keys();
		await Promise.all(
			cacheKeys.filter((key) => key !== 'downloads').map((key) => caches.delete(key))
		);
	}

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

	await Toast.show({
		text: 'All downloads deleted.',
		duration: 'short'
	});
}

async function restoreDefaultsAction() {
	await resetToDefaults();

	await Toast.show({
		text: 'Settings restored to defaults.',
		duration: 'short'
	});
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
				title: 'Restore Defaults',
				description: 'Reset all settings to their default values',
				placeholder: 'Restore',
				color: 'danger',
				action: restoreDefaultsAction
			}
		]
	}
]);

async function onSelectChange(key: AppSettingKey, event: CustomEvent) {
	await setValue(key, String(event.detail?.value ?? appSettings.value[key]) as any);
}

async function onToggleChange(key: AppSettingKey, event: CustomEvent) {
	const checked = Boolean(event.detail?.checked);
	await setValue(key, checked as any);

	if (key === 'pushNotifications') {
		await Toast.show({
			text: 'Push notification delivery is not implemented yet. Preference saved.',
			duration: 'short'
		});
	}
}

async function runAction(item: ActionSettingItem) {
	actionLoading[item.title] = true;

	try {
		await item.action();
	} finally {
		actionLoading[item.title] = false;
	}
}

onMounted(async () => {
	await initSettings();
});
</script>
