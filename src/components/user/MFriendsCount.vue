<template>
	<div class="flex gap-2 justify-center">
		<div
			v-if="!isThisUser"
			class="flex items-center justify-center p-2"
			@click="
				mutualOpen = true;
				mutualEvent = $event;
			"
		>
			<UIcon
				name="mdi:account-multiple"
				class="size-5"
			/>
			<h3 class="text-lg! font-semibold m-0!">{{ withSuffix(user.mutual_count ?? 0) }}</h3>
			<IonPopover
				:is-open="mutualOpen"
				:event="mutualEvent"
				@did-dismiss="mutualOpen = false"
			>
				<div class="max-w-xs p-4">
					<span class="text-sm">Number of friends you share with this person</span>
				</div>
			</IonPopover>
		</div>
		<div
			v-if="user.added_count !== undefined"
			class="flex items-center justify-center p-2"
			@click="
				addedOpen = true;
				addedEvent = $event;
			"
		>
			<UIcon
				name="mdi:account-plus"
				class="size-5"
			/>
			<h3 class="text-lg! font-semibold m-0!">{{ withSuffix(user.added_count ?? 0) }}</h3>
			<IonPopover
				:is-open="addedOpen"
				:event="addedEvent"
				@did-dismiss="addedOpen = false"
			>
				<div class="max-w-xs p-4">
					<span class="text-sm">Number of friends this person has added</span>
				</div>
			</IonPopover>
		</div>
		<div
			v-if="user.non_mutual_count !== undefined"
			class="flex items-center justify-center p-2"
			@click="
				nonMutualOpen = true;
				nonMutualEvent = $event;
			"
		>
			<UIcon
				name="mdi:account-minus"
				class="size-5"
			/>
			<h3 class="text-lg! font-semibold m-0!">{{ withSuffix(user.non_mutual_count ?? 0) }}</h3>
			<IonPopover
				:is-open="nonMutualOpen"
				:event="nonMutualEvent"
				@did-dismiss="nonMutualOpen = false"
			>
				<div class="max-w-xs p-4">
					<span class="text-sm">
						Number of friends this person has added that didn't add them back
					</span>
				</div>
			</IonPopover>
		</div>
	</div>
</template>
<script setup lang="ts">
import type { User } from '@earth-app/crust/src/shared/types/user';
import { withSuffix } from '@earth-app/crust/src/shared/util';

const props = defineProps<{
	user: User;
}>();

const { user: currentUser } = useAuth();
const { addFriend, removeFriend, addToCircle, removeFromCircle } = useFriends();
const isThisUser = computed(() => {
	return currentUser.value?.id === props.user.id;
});

const mutualOpen = ref(false);
const mutualEvent = ref<PointerEvent | null>(null);
const addedOpen = ref(false);
const addedEvent = ref<PointerEvent | null>(null);
const nonMutualOpen = ref(false);
const nonMutualEvent = ref<PointerEvent | null>(null);
</script>
