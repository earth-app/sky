<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonTitle>Memberships</IonTitle>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<div class="flex flex-col w-full px-4 pb-10 max-w-3xl mx-auto">
				<p class="text-sm opacity-80 text-center mt-4 mb-6">
					Upgrade to unlock more events, faster quests, creator tools, and more. Plans renew monthly
					and can be canceled anytime from Settings.
				</p>

				<div
					v-if="purchasesUnavailable"
					id="iap-unavailable"
					class="mb-4 rounded-xl border border-default p-4 flex flex-col gap-3"
				>
					<div class="text-sm font-semibold">Purchases Are Unavailable</div>
					<p class="text-xs! opacity-80 leading-relaxed">
						The App Store is not offering plans on this device right now. Everything in your current
						plan keeps working.
					</p>
					<IonButton
						fill="outline"
						size="small"
						color="medium"
						aria-label="Copy Diagnostic Info"
						@click="onCopyDiagnostics"
					>
						Copy Diagnostic Info
					</IonButton>
				</div>

				<MRanks :highlighted="highlighted" />

				<div class="flex flex-col items-center gap-1 mt-6">
					<IonButton
						fill="clear"
						size="small"
						color="medium"
						:disabled="restoring"
						@click="onRestore"
					>
						{{ restoring ? 'Restoring...' : 'Restore Purchases' }}
					</IonButton>
				</div>

				<!-- begin app-review 3.1.2(c) disclosure -->
				<div class="mt-6 rounded-xl border border-default p-4 flex flex-col gap-3">
					<div class="text-sm font-semibold">Subscription Details</div>

					<ul
						v-if="paidPlans.length"
						class="flex flex-col gap-1 text-xs! opacity-80 leading-relaxed"
					>
						<li
							v-for="plan in paidPlans"
							:key="plan.tier"
						>
							{{ plan.name }} - {{ plan.price_display }} per {{ plan.interval }} ({{
								lengthLabel(plan.interval)
							}}
							auto-renewing subscription)
						</li>
					</ul>

					<p class="text-xs! opacity-80 leading-relaxed">
						Payment is charged to your App Store account at confirmation of purchase. The
						subscription renews automatically at the same price and period unless canceled at least
						24 hours before the end of the current period. Manage or cancel in Settings &gt;
						Subscription, or in your App Store account settings.
					</p>

					<div class="flex flex-wrap items-center gap-2">
						<IonButton
							fill="outline"
							size="small"
							color="medium"
							aria-label="Terms of Use (EULA)"
							@click="openLegal(TERMS_URL)"
						>
							Terms of Use (EULA)
						</IonButton>
						<IonButton
							fill="outline"
							size="small"
							color="medium"
							aria-label="Privacy Policy"
							@click="openLegal(PRIVACY_URL)"
						>
							Privacy Policy
						</IonButton>
					</div>
				</div>
				<!-- end app-review 3.1.2(c) disclosure -->
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Browser } from '@capacitor/browser';
import type { IapDiagnostics } from '~/composables/useIapPurchase';
import { classifyAvailability, formatIapDiagnostics } from '~/composables/useIapPurchase';
import { showErrorToast, showInfoToast } from '~/composables/useNotify';

/** guideline 3.1.2(c) requires BOTH of these reachable from the purchase flow itself */
const TERMS_URL = 'https://earth-app.com/tos';
const PRIVACY_URL = 'https://earth-app.com/privacy-policy';

const route = useRoute();
const { restore, diagnose, isNative } = useIapPurchase();
const { plans, fetchPlans } = useSubscription();
const restoring = ref(false);
const diagnostics = ref<IapDiagnostics | null>(null);

// 'not_native' is the web preview, which is expected to have no store and must stay quiet
const purchasesUnavailable = computed(() => {
	if (!diagnostics.value) return false;
	const verdict = classifyAvailability(diagnostics.value);
	return verdict !== 'ok' && verdict !== 'not_native';
});

const highlighted = computed<'FREE' | 'PRO' | 'WRITER' | 'ORGANIZER' | undefined>(() => {
	const raw = String(route.query.plan ?? '').toUpperCase();
	return raw === 'FREE' || raw === 'PRO' || raw === 'WRITER' || raw === 'ORGANIZER'
		? (raw as 'FREE' | 'PRO' | 'WRITER' | 'ORGANIZER')
		: undefined;
});

// the free tier is not a subscription, so listing it here would misstate what renews
const paidPlans = computed(() => (plans.value ?? []).filter((plan) => plan.price_cents > 0));

function lengthLabel(interval: string | null | undefined): string {
	switch (interval) {
		case 'month':
			return '1 month';
		case 'year':
			return '1 year';
		case 'week':
			return '1 week';
		default:
			return String(interval ?? '');
	}
}

async function openLegal(url: string) {
	await Browser.open({ url });
}

async function onRestore() {
	if (restoring.value) return;
	restoring.value = true;
	try {
		const res = await restore();
		if (res.success) {
			await showInfoToast('Your Purchases Have Been Restored.');
		} else if (res.reason === 'nothing_to_restore') {
			await showInfoToast('No Previous Purchases Were Found to Restore.');
		} else if (res.reason !== 'cancelled') {
			await showErrorToast(res.error, { fallback: 'Could not restore your purchases.' });
		}
	} finally {
		restoring.value = false;
	}
}

async function onCopyDiagnostics() {
	const report = diagnostics.value ? formatIapDiagnostics(diagnostics.value) : '';
	if (!report) return;
	try {
		await navigator.clipboard.writeText(report);
		await showInfoToast('Diagnostic Info Copied.');
	} catch (error) {
		await showErrorToast(error, { fallback: 'Could not copy the diagnostic info.' });
	}
}

onMounted(async () => {
	await Promise.all([
		fetchPlans(),
		(async () => {
			if (!isNative()) return;
			diagnostics.value = await diagnose();
			if (purchasesUnavailable.value) {
				console.warn(`[iap] ${formatIapDiagnostics(diagnostics.value)}`);
			}
		})()
	]);
});
</script>
