<template>
	<IonPage class="justify-start!">
		<IonContent :fullscreen="true">
			<div class="w-full flex justify-center">
				<div class="relative size-32 sm:size-40 md:size-48 mt-28 mb-16">
					<EarthCircle />
				</div>
			</div>
			<div class="w-full flex flex-col items-center justify-center">
				<h1
					id="title"
					class="text-3xl"
				>
					The Earth App
				</h1>
				<h2 class="text-sm! font-medium! mt-0! px-2 text-center text-gray-600">
					Find your Novelty, Try New Things, Discover the World
				</h2>
				<div class="mt-8 px-8 max-w-md">
					<div
						v-if="offlineAuthBlocked"
						class="space-y-3 text-center"
					>
						<p class="text-sm text-gray-600 dark:text-gray-300">
							You are offline and logged out. Please come back online to log in.
						</p>
					</div>
					<div
						v-else-if="showAuthCta"
						class="space-y-3"
					>
						<IonButton
							expand="block"
							size="small"
							fill="solid"
							color="success"
							strong
							@click="goToSignup"
						>
							<UIcon
								name="mdi:account-plus"
								class="mr-2 size-5"
							/>
							Sign Up
						</IonButton>
						<IonButton
							expand="block"
							size="small"
							fill="solid"
							color="tertiary"
							strong
							@click="goToLogin"
						>
							<UIcon
								name="mdi:login"
								class="mr-2 size-5"
							/>
							Login
						</IonButton>
						<div class="flex flex-col space-y-2 my-6">
							<UserOAuthShield
								v-for="provider in OAUTH_PROVIDERS"
								:key="provider"
								:provider="provider"
								context="login"
							/>
						</div>
						<IonButton
							expand="block"
							fill="solid"
							:color="theme"
							@click="onboarding"
						>
							<UIcon
								name="mdi:restart"
								class="mr-2 size-5"
							/>
							Onboarding
						</IonButton>
					</div>
					<div v-else>
						<UIcon
							name="mdi:loading"
							class="animate-spin size-8 text-gray-600 dark:text-gray-300 mx-auto"
						/>
					</div>
				</div>
			</div>
		</IonContent>

		<IonModal
			:is-open="onboardingOpen"
			@didDismiss="onboardingOpen = false"
			style="--max-height: 80%; --width: 80%; --min-width: 350px"
		>
			<IonContent
				id="onboarding-modal-content"
				class="border-2"
				:scroll-y="true"
			>
				<OnboardingQuest
					@done="
						() => {
							onboardingOpen = false;
							goToSignup();
						}
					"
				/>
			</IonContent>
		</IonModal>
	</IonPage>
</template>

<script setup lang="ts">
import { Preferences } from '@capacitor/preferences';
import { SplashScreen } from '@capacitor/splash-screen';
import { OAUTH_PROVIDERS } from 'types/user';
import slide from '~/animations/slide';
import { theme } from '~/composables/useSettings';

const { user } = useAuth();
const { settings: appSettings } = useAppSettings();
const ionRouter = useIonRouter();
const { fetchState: fetchOnboardingState } = useOnboarding();

const offlineAuthBlocked = ref(false);

// hydration latch — keep the loader spinning until we know whether the user is
// authed or anon. Prevents the login/signup CTA flash before user resolves.
const bootResolved = ref(false);
const showAuthCta = computed(() => bootResolved.value && user.value === null);

function isOfflineEntryMode() {
	if (appSettings.value.offlineMode) return true;

	if (import.meta.client) {
		return !navigator.onLine;
	}

	return false;
}

function goToSignup() {
	ionRouter.push('/signup', slide);
}

function goToLogin() {
	ionRouter.push('/login', slide);
}

onMounted(async () => {
	// app.vue owns initSettings() and hydrateUser() — we just gate splash hide on user resolution
	if (isOfflineEntryMode()) {
		const cachedUser = await validateSessionAllowOffline();
		if (cachedUser) {
			void preloadHome('/tabs/downloads');
			await navigateTo('/tabs/downloads');
			await SplashScreen.hide().catch(() => {});
			return;
		}

		offlineAuthBlocked.value = true;
		bootResolved.value = true;
		await SplashScreen.hide().catch(() => {});
		return;
	}

	// wait at most 5s for hydration before showing UI
	await waitForUserResolution(5_000);
	bootResolved.value = true;
	await SplashScreen.hide().catch(() => {});

	if (user.value) {
		await navigateHome();
	} else {
		await maybeShowOnboarding();
	}
});

async function waitForUserResolution(timeoutMs: number) {
	if (user.value !== undefined) return;
	await new Promise<void>((resolve) => {
		const stop = watch(user, (value) => {
			if (value !== undefined) {
				stop();
				resolve();
			}
		});
		setTimeout(() => {
			stop();
			resolve();
		}, timeoutMs);
	});
}

async function maybeShowOnboarding() {
	let hasOpenedValue: string | null = null;
	try {
		const result = await Preferences.get({ key: 'hasOpened' });
		hasOpenedValue = result.value;
	} catch {
		// treat read failure as already-opened so we don't loop the modal
		hasOpenedValue = 'true';
	}
	if (!hasOpenedValue) {
		await Preferences.set({ key: 'hasOpened', value: 'true' }).catch(() => {});
		onboarding();
	}
}

// non-blocking preload — never let a slow chunk fetch keep the user on index
function preloadHome(destination: string) {
	if (!appSettings.value.preloadContent) return;
	void Promise.race([
		preloadRouteComponents(destination),
		new Promise((r) => setTimeout(r, 1500))
	]).catch(() => {});
}

let navigatingHome = false;
async function navigateHome() {
	if (navigatingHome) return;
	navigatingHome = true;
	const destination = isOfflineEntryMode() ? '/tabs/downloads' : '/tabs/dashboard';
	preloadHome(destination);
	void fetchOnboardingState().catch(() => {}); // best-effort; never block navigation
	void Preferences.set({ key: 'hasOpened', value: 'true' }).catch(() => {});
	try {
		await navigateTo(destination);
	} catch (err) {
		console.error('Home navigation failed, releasing latch:', err);
		navigatingHome = false;
	}
}

// safety net for late hydration (anon → authed mid-page, or token refresh)
watch(user, async (next, prev) => {
	if (next && !prev) {
		await navigateHome();
	}
});

const onboardingOpen = ref(false);
function onboarding() {
	onboardingOpen.value = true;
}
</script>
