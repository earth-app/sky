<template>
	<Ranks :highlighted="props.highlighted">
		<template #button="{ button, plan }">
			<IonButton
				:disabled="isButtonDisabled(button, plan)"
				:color="button?.color === 'error' ? 'danger' : button?.color"
				@click="onPurchase(plan)"
				>{{ button?.label }}</IonButton
			>
		</template>
	</Ranks>
</template>

<script setup lang="ts">
import type { AccountType } from 'types/user';
import { capitalizeFully } from 'utils';
import { showErrorToast, showInfoToast } from '~/composables/useNotify';

interface RankButton {
	label?: string;
	color?: string;
	disabled?: boolean;
}
interface RankPlan {
	title?: string;
	tier?: AccountType;
	button?: RankButton;
}

const props = defineProps<{
	highlighted?: 'FREE' | 'PRO' | 'WRITER' | 'ORGANIZER';
}>();

const { purchase, canPurchase } = useIapPurchase();
const purchasing = ref(false);

// crust Ranks passes plan.tier; fall back to title defensively for any older layer
function resolveTier(plan?: RankPlan): AccountType | null {
	const raw = String(plan?.tier ?? plan?.title ?? '').toUpperCase();
	const known: AccountType[] = ['FREE', 'PRO', 'WRITER', 'ORGANIZER', 'ADMINISTRATOR'];
	return known.includes(raw as AccountType) ? (raw as AccountType) : null;
}

function isPurchasable(button?: RankButton, plan?: RankPlan): boolean {
	const tier = resolveTier(plan);
	if (!tier || !canPurchase(tier)) return false;
	const label = button?.label ?? '';
	return label === 'Upgrade' || label === 'Sign Up';
}

function isButtonDisabled(button?: RankButton, plan?: RankPlan): boolean {
	if (purchasing.value) return true;
	if (isPurchasable(button, plan)) return false;
	return button?.disabled ?? true;
}

async function onPurchase(plan?: RankPlan) {
	const tier = resolveTier(plan);
	if (!tier || !canPurchase(tier) || purchasing.value) return;

	purchasing.value = true;
	try {
		const res = await purchase(tier);
		if (res.success) {
			await showInfoToast(`Your ${capitalizeFully(tier)} Plan is Now Active.`);
		} else if (res.reason === 'cancelled') {
			// user backed out; stay silent
		} else {
			await showErrorToast(res.error, {
				fallback: 'The purchase could not be completed. Please try again.'
			});
		}
	} finally {
		purchasing.value = false;
	}
}
</script>
