<template>
	<IonPage>
		<IonHeader class="ion-no-border">
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/settings" />
				</IonButtons>
				<IonTitle>Subscription</IonTitle>
			</IonToolbar>
		</IonHeader>

		<IonContent :scroll-y="true">
			<div class="flex flex-col w-full px-4 pb-8 max-w-3xl mx-auto">
				<p class="text-sm opacity-80 text-center mt-4 mb-4">
					{{
						Capacitor.isNativePlatform()
							? 'View your current plan and manage your subscription. You can cancel at any time.'
							: 'View your current plan, redeem a code, and manage your subscription. You can cancel at any time.'
					}}
				</p>

				<MEmptyState
					v-if="!user"
					icon="mdi:login-variant"
					title="Sign In to Manage Your Plan"
					description="You must be signed in to manage your subscription."
					cta-label="Sign In"
					cta-color="primary"
					cta-to="/login"
				/>

				<template v-else>
					<div
						v-if="loadingPage"
						class="flex items-center justify-center w-full py-12"
					>
						<IonSpinner name="crescent" />
					</div>

					<template v-else>
						<div class="w-full rounded-xl border-2 border-default p-4 mb-4">
							<div class="flex items-center justify-between gap-2">
								<div class="text-lg font-semibold">{{ tierLabel }}</div>
								<span
									class="text-xs font-semibold rounded-full px-2 py-0.5"
									:class="statusBadgeClass"
									>{{ statusLabel }}</span
								>
							</div>

							<div class="text-sm opacity-80 mt-2 flex flex-col gap-1">
								<div v-if="isTrial && trialEndLabel">Trial ends {{ trialEndLabel }}</div>
								<div v-else-if="cancelAtPeriodEnd && renewLabel">Access until {{ renewLabel }}</div>
								<div v-else-if="renewLabel">Renews on {{ renewLabel }}</div>
								<div v-if="providerLabel">Managed by {{ providerLabel }}</div>
								<div v-if="refundEligible && refundDeadlineLabel">
									Refund eligible until {{ refundDeadlineLabel }}
								</div>
							</div>
						</div>

						<IonButton
							color="warning"
							router-link="/tabs/upgrade"
							class="mb-4"
							>Upgrade</IonButton
						>

						<!-- app review 3.1.1: a code may not unlock paid functionality inside a store build -->
						<div
							v-if="!Capacitor.isNativePlatform()"
							class="w-full rounded-xl border border-default p-4 mb-4 flex flex-col gap-3"
						>
							<div class="text-sm font-medium">Redeem a Code</div>
							<IonItem>
								<IonInput
									v-model="code"
									label="Code"
									label-placement="floating"
									placeholder="EARTH-XXXX-XXXX"
									:disabled="submitting"
									@keyup.enter="onRedeem"
								/>
							</IonItem>
							<IonButton
								color="primary"
								:disabled="!code.trim() || submitting"
								@click="onRedeem"
							>
								<IonSpinner
									v-if="redeeming"
									name="crescent"
								/>
								<span v-else>Redeem Code</span>
							</IonButton>
						</div>

						<IonButton
							v-if="canCancel"
							expand="block"
							color="danger"
							fill="outline"
							:disabled="submitting"
							@click="onCancel"
						>
							<IonSpinner
								v-if="canceling"
								name="crescent"
							/>
							<span v-else>Cancel Subscription</span>
						</IonButton>

						<p
							v-if="canCancel"
							class="text-xs opacity-70 text-center mt-2"
						>
							Cancel anytime. Store-managed subscriptions open your app store account to finish.
						</p>
					</template>
				</template>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Dialog } from '@capacitor/dialog';
import { capitalizeFully } from 'utils';
import { showErrorToast, showInfoToast } from '~/composables/useNotify';

const { user, fetchUser } = useAuth();
// auto-imported from the crust layer (@earth-app/crust >= 0.6.0)
const { status, submitting, fetchStatus, cancel, redeemCode } = useSubscription();

const loadingPage = ref(true);
const redeeming = ref(false);
const canceling = ref(false);
const code = ref('');

const tierLabel = computed(() => capitalizeFully(status.value?.tier ?? 'free'));
const isTrial = computed(() => Boolean(status.value?.is_trial));
const cancelAtPeriodEnd = computed(() => Boolean(status.value?.cancel_at_period_end));
const refundEligible = computed(() => Boolean(status.value?.refund_eligible));

const STATUS_LABELS: Record<string, string> = {
	active: 'Active',
	trialing: 'Trial',
	past_due: 'Past Due',
	canceled: 'Canceled',
	refunded: 'Refunded',
	incomplete: 'Incomplete',
	none: 'No Plan'
};
const statusLabel = computed(() => STATUS_LABELS[status.value?.status ?? 'none'] ?? 'No Plan');

const statusBadgeClass = computed(() => {
	switch (status.value?.status) {
		case 'active':
		case 'trialing':
			return 'bg-green-500/15 text-green-500';
		case 'past_due':
		case 'incomplete':
			return 'bg-amber-500/15 text-amber-500';
		case 'canceled':
		case 'refunded':
			return 'bg-red-500/15 text-red-500';
		default:
			return 'bg-default/40 opacity-70';
	}
});

const providerLabel = computed(() => {
	switch (status.value?.provider) {
		case 'apple':
			return 'the App Store';
		case 'google':
			return 'Google Play';
		case 'stripe':
			return 'Stripe';
		case 'trial':
			return 'a Trial Code';
		default:
			return '';
	}
});

const canCancel = computed(
	() =>
		(status.value?.status === 'active' || status.value?.status === 'trialing') &&
		!cancelAtPeriodEnd.value
);

function formatDate(iso: string | null | undefined): string {
	if (!iso) return '';
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return '';
	return new Date(t).toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

const renewLabel = computed(() => formatDate(status.value?.current_period_end));
const trialEndLabel = computed(() => formatDate(status.value?.trial_end));
const refundDeadlineLabel = computed(() => formatDate(status.value?.refund_deadline));

async function refresh() {
	await fetchStatus();
}

async function onRedeem() {
	const value = code.value.trim();
	if (!value || submitting.value) return;
	redeeming.value = true;
	try {
		const res = await redeemCode(value);
		if (res.success) {
			code.value = '';
			const message = (res.data as { message?: string } | undefined)?.message;
			await showInfoToast(message || 'Your code was redeemed.');
			await refresh();
		} else {
			await showErrorToast(res.error, {
				fallback: 'That code could not be redeemed. Check the code and try again.'
			});
		}
	} finally {
		redeeming.value = false;
	}
}

async function onCancel() {
	if (submitting.value) return;
	const { value } = await Dialog.confirm({
		title: 'Cancel Subscription',
		message:
			'Cancel your subscription? You keep access until the end of the current billing period unless a refund applies.',
		okButtonTitle: 'Cancel Subscription',
		cancelButtonTitle: 'Keep Plan'
	});
	if (!value) return;

	canceling.value = true;
	try {
		const res = await cancel();
		if (res.success) {
			const data = res.data as
				{ result?: string; manage_url?: string; message?: string } | undefined;
			if (data?.result === 'store_managed' && data.manage_url) {
				await showInfoToast(data.message || 'Finish canceling in your app store account.');
				await Browser.open({ url: data.manage_url });
			} else {
				await showInfoToast(data?.message || 'Your subscription has been canceled.');
			}
			await refresh();
		} else {
			await showErrorToast(res.error, { fallback: 'Could not cancel your subscription.' });
		}
	} finally {
		canceling.value = false;
	}
}

onMounted(async () => {
	try {
		await fetchUser();
		if (user.value) await refresh();
	} finally {
		loadingPage.value = false;
	}
});
</script>
