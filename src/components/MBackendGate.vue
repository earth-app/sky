<template>
	<div
		id="backend-gate"
		role="alert"
		aria-live="assertive"
		class="space-y-3 text-center"
	>
		<UIcon
			:name="copy.icon"
			class="size-10"
			:class="isMaintenance ? 'm-text-warning' : 'm-text-danger'"
		/>

		<h3 class="text-lg font-semibold text-highlighted">{{ copy.title }}</h3>

		<p class="text-sm text-muted">{{ copy.body }}</p>

		<IonButton
			expand="block"
			size="small"
			fill="solid"
			color="primary"
			strong
			:disabled="backend.checking"
			@click="retry"
		>
			<UIcon
				name="mdi:refresh"
				class="mr-2 size-4"
			/>
			Try Again
		</IonButton>

		<IonButton
			expand="block"
			size="small"
			fill="outline"
			color="medium"
			@click="open(STATUS_PAGE_URL)"
		>
			Check Status
		</IonButton>

		<IonButton
			v-if="!isMaintenance"
			expand="block"
			size="small"
			fill="outline"
			color="medium"
			@click="open(SUPPORT_PAGE_URL)"
		>
			Contact Support
		</IonButton>

		<p class="text-2xs text-muted">{{ copy.footer }}</p>
	</div>
</template>

<script setup lang="ts">
import { Browser } from '@capacitor/browser';
import { STATUS_PAGE_URL, SUPPORT_PAGE_URL } from 'backend';
import { useBackendStore } from 'stores/backend';

const backend = useBackendStore();

const isMaintenance = computed(() => backend.mantle === 'maintenance');

/* no blame and no dead end: say which side is affected, that nothing of theirs is lost, and give a
   next action. interface text engages the same social-response machinery as speech (Reeves & Nass),
   so "we" carrying the fault is not cosmetic */
const copy = computed(() =>
	isMaintenance.value
		? {
				icon: 'mdi:wrench-outline',
				title: 'Under Maintenance',
				body: 'We are making some changes and will be back shortly. Nothing you have saved is affected.',
				footer: 'This checks again on its own every 30 seconds.'
			}
		: {
				icon: 'mdi:cloud-alert-outline',
				title: "We can't reach The Earth App",
				body: 'Our servers are not responding right now. This is on our end, not yours, and your account and data are safe.',
				footer: 'This checks again on its own every 30 seconds.'
			}
);

// an in-app browser, because a bare target=_blank inside the capacitor webview goes nowhere
async function open(url: string) {
	await Browser.open({ url }).catch(() => {});
}

async function retry() {
	await backend.preflight(true);
}

onMounted(() => backend.startRecoveryPolling());
onUnmounted(() => backend.stopRecoveryPolling());
</script>
