<template>
	<button
		v-if="editable"
		type="button"
		data-testid="type-badge-editor"
		class="appearance-none bg-transparent border-0 p-0 m-0 cursor-pointer"
		@click="openEditor"
	>
		<UBadge
			:label="badgeLabel"
			:class="badgeStyling"
			:ui="{ base: 'justify-center' }"
			class="px-1! sm:px-2! md:px-3! py-1! rounded-full! text-white! text-sm! font-semibold!"
		/>
	</button>
	<UBadge
		v-else-if="effectiveType && effectiveType !== 'FREE'"
		:label="badgeLabel"
		:class="badgeStyling"
		:ui="{ base: 'justify-center' }"
		class="px-2! md:px-3! py-1! rounded-full! text-white! text-sm! font-semibold!"
	/>
</template>

<script setup lang="ts">
import { actionSheetController } from '@ionic/vue';
import type { AccountType, User } from 'types/user';
import { ACCOUNT_TYPES, accountTypeLabel } from '~/utils/ranks';

const props = defineProps<{
	user: User;
}>();

const { setAccountType } = useUser(() => props.user.id);
const { user: currentUser } = useAuth();

// a successful set writes here; it sticks even when the store swaps in a stale server echo (flash-revert fix)
const overrideType = ref<AccountType | null>(null);
const effectiveType = computed(() => overrideType.value ?? props.user.account?.account_type);

// clear the override once the store's authoritative value catches up, so external changes still show
watch(
	() => props.user.account?.account_type,
	(val) => {
		if (overrideType.value && val === overrideType.value) overrideType.value = null;
	}
);

// only an admin viewer may edit; non-admins see the badge as before
const editable = computed(() => currentUser.value?.account?.account_type === 'ADMINISTRATOR');

const badgeLabel = computed(() => {
	const type = effectiveType.value;
	if (!type) return 'Free';
	return accountTypeLabel(type);
});

const badgeStyling = computed(() => {
	switch (effectiveType.value) {
		case 'ADMINISTRATOR':
			return 'bg-red-500! font-bold';
		case 'ORGANIZER':
			return 'bg-green-500! font-semibold';
		case 'WRITER':
			return 'bg-yellow-500! font-medium';
		case 'PRO':
			return 'bg-blue-500!';
		default:
			return 'bg-gray-500!';
	}
});

async function openEditor() {
	const current = effectiveType.value;
	const sheet = await actionSheetController.create({
		header: 'Set Account Level',
		buttons: [
			...ACCOUNT_TYPES.map((type) => ({
				text: accountTypeLabel(type),
				disabled: type === current,
				handler: () => {
					void handleSetAccountType(type);
				}
			})),
			{ text: 'Cancel', role: 'cancel' as const }
		]
	});
	await sheet.present();
}

async function handleSetAccountType(type: AccountType) {
	if (!props.user.account) return;
	if (type === effectiveType.value) return;

	// optimistic via override only (no shared-object mutation, which would trip the watcher and
	// re-expose a stale echo); effectiveType shows it immediately and it survives the store swap
	overrideType.value = type;
	const res = await setAccountType(type);

	if (!res?.success) {
		overrideType.value = null;
		await showErrorToast(res?.message, {
			fallback: 'Failed to Update Account Level. Please Try Again.'
		});
		return;
	}

	await showInfoToast(
		`Account Level Set to ${accountTypeLabel(type)} for @${props.user.username}.`
	);
}
</script>
