<template>
	<div class="flex flex-col size-full">
		<div class="flex gap-8 justify-center justify-items-center items-center px-4 mt-6">
			<div class="flex flex-col items-center justify-evenly self-start py-4">
				<UAvatar
					:src="avatar"
					class="size-24 shadow-lg rounded-full shadow-black/70"
				/>
				<UserMFriendsButtons :user="user" />
				<UserMFriendsCount :user="user" />
			</div>
			<div class="flex items-center">
				<div class="flex flex-col">
					<h2 class="text-lg! my-0!">{{ displayName }}</h2>
					<h3 class="text-sm! my-0! text-gray-600 light:text-gray-400">{{ user.username }}</h3>
					<UserMTypeBadge
						:user="user"
						class="mt-4"
					/>
					<UserMJourneys
						:user="user"
						class="m-2"
					/>
				</div>
			</div>
		</div>
		<div class="flex flex-col items-center justify-center my-6 px-4">
			<div class="flex mb-4">
				<UBadge
					v-if="props.user.account.email && props.user.account.email_verified"
					:label="props.user.account.email"
					variant="subtle"
					icon="mdi:mail-ru"
					class="mr-2 hover:cursor-pointer"
					@click="openEmail"
				/>
				<UBadge
					v-if="props.user.account.address"
					:label="props.user.account.address"
					variant="subtle"
					icon="mdi:map-marker"
					color="warning"
					class="mr-2"
				/>
				<UBadge
					v-if="props.user.account.country"
					:label="props.user.account.country"
					variant="subtle"
					icon="mdi:flag"
					color="info"
					class="mr-2"
				/>
			</div>
			<div class="flex items-center justify-center flex-wrap max-w-80">
				<UBadge
					v-for="(activity, i) in props.user.activities"
					:label="activity.name"
					:color="i <= 2 ? 'primary' : 'secondary'"
					:icon="activity.fields['icon']"
					variant="solid"
					@click="goToActivity(activity.id)"
					:ui="{
						base: 'text-sm md:text-base lg:text-lg px-1 sm:px-1.5 md:px-2.5 py-1 gap-1 md:gap-1.5 rounded-sm sm:rounded-md',
						leadingIcon: 'size-4 sm:size-5 md:size-6'
					}"
					class="hover:cursor-pointer transition-all duration-500 ml-2 mb-2 sm:mb-3"
				/>
			</div>
		</div>
		<div class="flex flex-col items-center justify-center px-8 gap-2 mb-6">
			<IonButton
				fill="outline"
				color="success"
				class="w-full"
				@click="openBadgesDrawer"
			>
				<span class="flex flex-wrap gap-2 items-center justify-center w-full">
					<UIcon name="mdi:badge-account-horizontal-outline" />
					<span>View Badges Collected</span>
					<span>({{ grantedBadges.length }} / {{ badges.length }})</span>
				</span>
			</IonButton>
			<MContentDrawer
				ref="badgesDrawerRef"
				title="Badges"
				class="w-full"
			>
				<template #default="{ search }">
					<UserBadgeMPage
						:badges="badges || []"
						:search="search || ''"
					/>
				</template>
			</MContentDrawer>

			<IonButton
				fill="outline"
				color="tertiary"
				class="w-full"
				@click="openPointsDrawer"
			>
				<span class="flex flex-wrap gap-2 items-center justify-center w-full">
					<UIcon name="mdi:star-circle-outline" />
					<span>View Points</span>
					<span>({{ points }})</span>
				</span>
			</IonButton>
			<MContentDrawer
				ref="pointsDrawerRef"
				title="Points"
				class="w-full"
				:searchable="false"
			>
				<template #default>
					<div class="flex flex-col w-full px-4">
						<h2 class="self-center">{{ points }} Points</h2>
						<UTable
							:data="pointsHistory ? [...pointsHistory].reverse() : []"
							:loading="pointsHistory === undefined"
							:columns="[
								{
									accessorKey: 'timestamp',
									header: 'Date',
									cell: ({ row }) =>
										row.original.timestamp
											? DateTime.fromMillis(row.original.timestamp).toRelative({
													locale: i18n.locale.value
												})
											: 'sometime',
									size: 110
								},
								{
									accessorKey: 'difference',
									header: 'Change',
									cell: ({ row }) => {
										const diff = row.original.difference;
										const sign = diff > 0 ? '+' : '';
										return h(
											IonChip,
											{
												color: diff > 0 ? 'success' : 'danger',
												class:
													'min-w-0! w-12! h-6! m-0! px-0! text-xs! flex flex-wrap justify-center items-center'
											},
											() => `${sign}${diff}`
										);
									},
									size: 80
								},
								{
									accessorKey: 'reason',
									header: 'Reason',
									size: 999
								}
							]"
							:ui="{
								tr: 'flex items-center gap-4 py-0',
								td: 'text-xs! py-1.5! flex items-center first:w-22 first:shrink-0 nth-2:w-12 nth-2:shrink-0 last:flex-1 last:truncate',
								th: 'text-xs! font-semibold first:w-22 first:shrink-0 nth-2:w-12 nth-2:shrink-0 last:flex-1',
								thead: 'border-b border-white/10',
								tbody: 'divide-y divide-white/5'
							}"
						/>
					</div>
				</template>
			</MContentDrawer>
		</div>
		<div class="flex flex-col items-center justify-center px-8 gap-2">
			<div
				v-if="friends.length > 0"
				class="flex flex-col items-center"
			>
				<h2 class="text-lg! my-0! mb-2">Friends</h2>
				<MInfoCardGroup
					:title="`Friends of ${displayName}`"
					:description="`${friends.length} Friends of ${props.user.username} (${Math.min(friends.length, 25)} shown here)`"
					icon="mdi:account-group-outline"
					class="w-11/12 my-4"
					show-progress
				>
					<LazyUserMCard
						v-for="friend in friends"
						:key="friend.id"
						:user="friend"
						class="min-w-40"
						hydrate-on-visible
					/>
				</MInfoCardGroup>
			</div>

			<div
				v-if="prompts.length > 0"
				class="flex flex-col m-2"
			>
				<h2 class="text-lg! my-0! mb-2">Prompts Created</h2>

				<MInfoCardGroup
					:title="`Prompts by ${displayName}`"
					:description="`${totalPrompts} Prompts created by ${props.user.username} (${Math.min(totalPrompts, 25)} shown here)`"
					icon="mdi:pencil-circle-outline"
					class="w-11/12 my-4"
					show-progress
				>
					<LazyPromptMCard
						v-for="prompt in prompts"
						:key="prompt.id"
						:prompt="prompt"
						hydrate-on-visible
					/>
				</MInfoCardGroup>
			</div>

			<div v-if="articles.length > 0">
				<h2 class="text-lg! my-0! mb-2">Articles Created</h2>

				<MInfoCardGroup
					:title="`Articles by ${displayName}`"
					:description="`${totalArticles} Articles created by ${props.user.username} (${Math.min(totalArticles, 25)} shown here)`"
					icon="mdi:newspaper-variant-multiple-outline"
					class="w-11/12 my-4"
					show-progress
				>
					<LazyArticleMCard
						v-for="article in articles"
						:key="article.id"
						:article="article"
						hydrate-on-visible
					/>
				</MInfoCardGroup>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { IonChip, UBadge } from '#components';
import { DateTime } from 'luxon';
import type { User } from 'types/user';
import { h } from 'vue';
import MContentDrawer from '~/components/MContentDrawer.vue';

const props = defineProps<{
	user: User;
}>();

const {
	avatar,
	fetchAvatar,
	user: userState,
	fetchUser,
	badges,
	grantedBadges,
	fetchBadges,
	points,
	pointsHistory,
	fetchPoints
} = useUser(props.user.id);
const { name: displayName } = useDisplayName(props.user);
const i18n = useI18n();

const user = computed(() => userState.value || props.user);

const { friends, fetchFriends } = useFriends(props.user.id);
const {
	prompts,
	total: totalPrompts,
	fetch: fetchPrompts
} = useUserPrompts(props.user.id, 1, 25, 'rand');
const {
	articles,
	total: totalArticles,
	fetch: fetchArticles
} = useUserArticles(props.user.id, 1, 25, 'rand');

async function openEmail() {
	const email = props.user.account.email;
	if (email) {
		window.open(`mailto:${email}`, '_blank');
	}
}

function goToActivity(id: string) {
	navigateTo(`/tabs/activities/${id}`);
}

onMounted(() => {
	fetchUser();
	fetchAvatar();
	fetchBadges();
	fetchPoints();

	fetchFriends();
	fetchPrompts();
	fetchArticles();
});

const badgesDrawerRef = ref<InstanceType<typeof MContentDrawer>>();
const openBadgesDrawer = () => {
	badgesDrawerRef.value?.open();
};

const pointsDrawerRef = ref<InstanceType<typeof MContentDrawer>>();
const openPointsDrawer = () => {
	pointsDrawerRef.value?.open();
};
</script>
