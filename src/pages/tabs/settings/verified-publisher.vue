<template>
	<IonPage>
		<IonHeader class="ion-no-border">
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/settings" />
				</IonButtons>
				<IonTitle>Verified Publisher</IonTitle>
			</IonToolbar>
		</IonHeader>

		<IonContent :scroll-y="true">
			<div
				id="verified-publisher"
				class="flex flex-col w-full px-4 pb-8 max-w-3xl mx-auto"
			>
				<p class="text-sm opacity-80 text-center mt-4 mb-4">
					Verified publishers can submit activities to the public catalog. Submissions are reviewed
					before they go live.
				</p>

				<div
					v-if="loading"
					class="flex items-center justify-center w-full py-12"
				>
					<IonSpinner name="crescent" />
				</div>

				<template v-else>
					<div
						v-if="badge"
						class="flex justify-center mb-4"
					>
						<IonChip
							:color="badge.color"
							class="px-4"
						>
							<UIcon
								:name="badge.icon"
								class="mr-1"
							/>
							{{ badge.label }}
						</IonChip>
					</div>

					<!-- none / revoked: the application form -->
					<div
						v-if="state === 'none' || state === 'revoked'"
						class="w-full rounded-xl border border-black/20 light:border-gray-300 p-4 flex flex-col gap-3"
					>
						<IonInput
							v-model="form.organization"
							label="Organization"
							label-placement="stacked"
							placeholder="Bay Area Climbing Collective"
							:class="{ 'ion-invalid ion-touched': errors.organization }"
							:error-text="errors.organization"
						/>

						<IonInput
							v-model="form.website"
							type="url"
							label="Website"
							label-placement="stacked"
							placeholder="https://example.org"
							:class="{ 'ion-invalid ion-touched': errors.website }"
							:error-text="errors.website"
						/>

						<IonTextarea
							v-model="form.reason"
							label="Why should you be verified?"
							label-placement="stacked"
							:rows="4"
							:maxlength="1000"
							counter
							auto-grow
							placeholder="Tell us about the community you organize for."
							:class="{ 'ion-invalid ion-touched': errors.reason }"
							:error-text="errors.reason"
						/>

						<IonInput
							v-model="form.activity_examples"
							label="Example activities"
							label-placement="stacked"
							placeholder="bouldering, via ferrata"
							:class="{ 'ion-invalid ion-touched': errors.activity_examples }"
							:error-text="errors.activity_examples"
						/>

						<IonCheckbox
							v-model="form.agrees_to_guidelines"
							label-placement="end"
							justify="start"
							class="text-sm"
						>
							I agree to the publishing guidelines
						</IonCheckbox>
						<div
							v-if="errors.agrees_to_guidelines"
							class="text-xs text-red-500"
						>
							{{ errors.agrees_to_guidelines }}
						</div>

						<IonButton
							expand="block"
							:disabled="submitting"
							data-testid="verified-publisher-submit"
							@click="submit"
						>
							<IonSpinner
								v-if="submitting"
								name="crescent"
							/>
							<span v-else>Apply for Verification</span>
						</IonButton>
					</div>

					<!-- pending -->
					<div
						v-else-if="state === 'pending'"
						class="w-full rounded-xl border border-black/20 light:border-gray-300 p-4"
					>
						<p class="text-sm opacity-80">
							Applied {{ relative(application?.applied_at) }}. Applications are reviewed in the
							order they arrive.
						</p>
					</div>

					<!-- approved -->
					<div
						v-else-if="state === 'approved'"
						class="w-full rounded-xl border border-black/20 light:border-gray-300 p-4 flex flex-col gap-3"
					>
						<p class="text-sm opacity-80">
							Verified {{ relative(application?.reviewed_at) }}. Submit activities from the web app
							to have them reviewed.
						</p>
						<div
							v-for="staged in submissions"
							:key="staged.id"
							class="flex items-center justify-between gap-2 text-sm"
						>
							<span>{{ staged.activity.name }}</span>
							<IonChip
								:color="staged.state === 'pending' ? 'warning' : 'medium'"
								class="text-xs"
								>{{ staged.state }}</IonChip
							>
						</div>
					</div>

					<!-- denied -->
					<div
						v-else
						class="w-full rounded-xl border border-black/20 light:border-gray-300 p-4 flex flex-col gap-3"
					>
						<p
							v-if="application?.notes"
							class="text-sm"
						>
							{{ application.notes }}
						</p>
						<p class="text-sm opacity-80">
							<span v-if="canReapply">You can apply again now.</span>
							<span v-else-if="application?.can_reapply_at"
								>You can re-apply after {{ formatDate(application.can_reapply_at) }}.</span
							>
						</p>
						<IonButton
							expand="block"
							fill="outline"
							:disabled="!canReapply"
							@click="state = 'none'"
							>Apply Again</IonButton
						>
					</div>
				</template>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { DateTime } from 'luxon';
import { verifiedPublisherApplicationSchema } from 'schemas';
import type { StagedActivity } from 'types/activity';
import type { VerifiedPublisher, VerifiedPublisherState } from 'types/user';

const { status, apply } = useVerifiedPublisher();
const { mine } = useStagedActivities();
const haptics = useAppHaptics();

const loading = ref(true);
const submitting = ref(false);
const state = ref<VerifiedPublisherState>('none');
const application = ref<VerifiedPublisher | null>(null);
const submissions = ref<StagedActivity[]>([]);
const errors = ref<Record<string, string>>({});

const form = reactive({
	organization: '',
	website: '',
	reason: '',
	activity_examples: '',
	agrees_to_guidelines: false
});

const badge = computed(() => {
	switch (state.value) {
		case 'pending':
			return { label: 'Under Review', color: 'warning', icon: 'mdi:clock-outline' };
		case 'approved':
			return { label: 'Verified Publisher', color: 'success', icon: 'mdi:check-decagram' };
		case 'denied':
			return { label: 'Not Approved', color: 'danger', icon: 'mdi:close-circle-outline' };
		case 'revoked':
			return { label: 'Revoked', color: 'danger', icon: 'mdi:shield-off-outline' };
		default:
			return null;
	}
});

const canReapply = computed(() => {
	const at = application.value?.can_reapply_at;
	return !at || DateTime.fromISO(at) <= DateTime.now();
});

function relative(value?: string | null): string {
	return value ? (DateTime.fromISO(value).toRelative() ?? 'recently') : 'recently';
}

function formatDate(value: string): string {
	return DateTime.fromISO(value).toLocaleString(DateTime.DATE_MED);
}

async function load() {
	loading.value = true;
	try {
		const res = await status();
		if (res.success && res.data) {
			application.value = res.data;
			state.value = res.data.state;

			if (res.data.state === 'approved') {
				const own = await mine();
				if (own.success && own.data) submissions.value = own.data.items ?? [];
			}
		}
	} finally {
		loading.value = false;
	}
}

async function submit() {
	// no UForm in Ionic, so run the shared schema by hand
	const parsed = verifiedPublisherApplicationSchema.safeParse({ ...form });
	if (!parsed.success) {
		errors.value = Object.fromEntries(
			parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])
		);
		await showErrorToast('Please fix the highlighted fields');
		await haptics.notifyError();
		return;
	}

	errors.value = {};
	submitting.value = true;
	try {
		const res = await apply({
			reason: form.reason,
			organization: form.organization || undefined,
			links: form.website ? [form.website] : []
		});

		if (res.success && res.data) {
			application.value = res.data;
			state.value = res.data.state;
			await showInfoToast('Application submitted for review');
			await haptics.notifySuccess();
		} else {
			await showErrorToast(res.message || 'Could not submit your application');
			await haptics.notifyError();
		}
	} finally {
		submitting.value = false;
	}
}

onMounted(load);
</script>
