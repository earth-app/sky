<template>
	<IonPage>
		<IonContent>
			<IonTabs>
				<IonRouterOutlet :animation="slide" />
				<IonTabBar slot="bottom">
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
						tab="adventure"
						href="/tabs/adventure"
					>
						<div class="flex items-center justify p-1 size-9 rounded-full">
							<UIcon
								name="mdi:sword-cross"
								class="size-full"
							/>
						</div>
					</IonTabButton>
					<IonTabButton
						tab="create"
						href="/tabs/create"
					>
						<div class="flex items-center justify p-1 size-9 rounded-full">
							<UIcon
								name="mdi:plus-circle"
								class="size-full"
							/>
						</div>
					</IonTabButton>
					<IonTabButton
						tab="discover"
						href="/tabs/discover"
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
				</IonTabBar>
			</IonTabs>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import slide from '~/animations/slide';

const { user, avatar128 } = useAuth();
const route = useRoute();

const profileHref = computed(() =>
	user.value?.username ? `/tabs/profile/@${user.value.username}` : '/tabs/dashboard'
);

const refreshDashboard = inject<(() => Promise<void>) | null>('refreshDashboard', null);
async function handleHomeButtonClick(event: Event) {
	if (route.path === '/tabs/dashboard' && refreshDashboard) {
		event.preventDefault();
		await refreshDashboard();
	}
}
</script>

<style>
@layer base {
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
