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
		v-else-if="props.user.account?.account_type && props.user.account.account_type !== 'FREE'"
		:label="badgeLabel"
		:class="badgeStyling"
		:ui="{ base: 'justify-center' }"
		class="px-1 sm:px-2 md:px-3 py-1 rounded-full text-white text-sm font-semibold"
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

// only an admin viewer may edit; non-admins see the badge as before
const editable = computed(() => currentUser.value?.account?.account_type === 'ADMINISTRATOR');

const badgeLabel = computed(() => {
	const type = props.user.account?.account_type;
	if (!type) return 'Free';
	return accountTypeLabel(type);
});

const badgeStyling = computed(() => {
	switch (props.user.account?.account_type) {
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
	const current = props.user.account?.account_type;
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

	const old = props.user.account.account_type;
	if (type === old) return;

	// optimistic; revert on failure
	props.user.account.account_type = type;
	const res = await setAccountType(type);

	if (!res?.success) {
		props.user.account.account_type = old;
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
