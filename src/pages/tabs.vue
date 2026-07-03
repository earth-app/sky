<template>
	<IonPage>
		<IonTabs>
			<IonRouterOutlet :animation="slide" />
			<IonTabBar
				id="navbar"
				slot="bottom"
				class="pb-4"
			>
				<IonTabButton
					tab="dashboard"
					href="/tabs/dashboard"
					@click="handleHomeButtonClick"
				>
					<div class="flex items-center justify p-1 size-9 rounded-full">
						<UIcon
							name="mdi:home-circle"
							class="size-full"
						/>
					</div>
				</IonTabButton>
				<IonTabButton
					tab="quests"
					href="/tabs/quests"
				>
					<div class="flex items-center justify p-1 size-9 rounded-full">
						<UIcon
							name="mdi:sword-cross"
							class="size-full"
						/>
					</div>
				</IonTabButton>
				<!-- spacing placeholder for the centered create FAB -->
				<IonTabButton disabled />
				<IonTabButton
					tab="discover"
					href="/tabs/discover"
					@click.capture="handleDiscoverButtonClick"
				>
					<div class="flex items-center justify p-1 size-9 rounded-full">
						<UIcon
							name="mdi:magnify"
							class="w-full h-full"
						/>
					</div>
				</IonTabButton>
				<IonTabButton
					tab="profile"
					:href="profileHref"
				>
					<div class="flex items-center justify-center rounded-full">
						<UAvatar
							:src="avatar128"
							icon="mdi:account-circle"
							loading="eager"
							class="size-7"
						/>
					</div>
				</IonTabButton>

				<IonFab class="create-fab">
					<IonFabButton class="size-10">
						<UIcon
							name="mdi:plus-circle"
							class="size-7"
						/>
					</IonFabButton>

					<IonFabList
						side="top"
						class="gap-2 mb-14 *:size-10 min-w-11!"
					>
						<IonFabButton
							color="secondary"
							router-link="/tabs/prompts/new"
						>
							<UIcon
								name="mdi:comment-plus-outline"
								class="min-w-6/10 min-h-6/10"
							/>
						</IonFabButton>

						<IonFabButton
							color="secondary"
							router-link="/tabs/articles/new"
						>
							<UIcon
								name="mdi:pencil-plus-outline"
								class="min-w-6/10 min-h-6/10"
							/>
						</IonFabButton>

						<IonFabButton
							color="secondary"
							router-link="/tabs/events/new"
						>
							<UIcon
								name="mdi:calendar-plus-outline"
								class="min-w-6/10 min-h-6/10"
							/>
						</IonFabButton>
					</IonFabList>
				</IonFab>
			</IonTabBar>
		</IonTabs>
	</IonPage>
</template>

<script setup lang="ts">
import slide from '~/animations/slide';

const { user, avatar128, fetchUser } = useAuth();
const authStore = useAuthStore();
const route = useRoute();
const dashboardRefreshSignal = useState<number>('dashboard-refresh-signal', () => 0);
const discoverScrollSignal = useState<number>('discover-scroll-signal', () => 0);

const profileHref = computed(() => {
	if (user.value?.username) return `/tabs/profile/@${user.value.username}`;
	if (authStore.sessionToken) return '/tabs/profile/editor';

	return '/profile';
});

function handleHomeButtonClick(event: Event) {
	if (route.path.startsWith('/tabs/dashboard')) {
		event.preventDefault();
		dashboardRefreshSignal.value += 1;
	}
}

function handleDiscoverButtonClick() {
	if (route.path.startsWith('/tabs/discover')) {
		discoverScrollSignal.value += 1;
	}
}

onMounted(async () => {
	if (user.value !== undefined) return;

	try {
		await fetchUser();
	} catch (error) {
		console.warn('Failed to hydrate auth user in tabs shell:', error);
	}
});
</script>

<style>
@layer base {
	ion-tab-bar#navbar {
		overflow: visible;
		contain: none;
	}

	#navbar .create-fab {
		top: auto;
		right: auto;
		bottom: 1rem;
		left: 50%;
		margin: 0;
		transform: translateX(-50%);
	}

	.tab-selected div {
		outline: 2px solid var(--ion-tab-bar-color-selected);
	}
}

@layer theme {
	.light {
		--ion-tab-bar-background: #faf9f9;
		--ion-tab-bar-color: #232323;
		--ion-tab-bar-color-selected: var(--ion-color-tertiary);
	}

	.dark {
		--ion-tab-bar-background: #121116;
		--ion-tab-bar-color: #efefef;
		--ion-tab-bar-color-selected: var(--ion-color-primary);
	}
}
</style>
