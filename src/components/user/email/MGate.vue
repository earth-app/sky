<template>
	<IonModal
		:is-open="open"
		:backdrop-dismiss="!sending"
		@didDismiss="onDismiss"
		style="--max-height: 60%; --width: 90%; --min-width: 320px"
	>
		<IonContent :scroll-y="true">
			<div class="p-6 flex flex-col gap-4">
				<div class="flex items-start gap-3">
					<UIcon
						:name="hasEmail ? 'mdi:email-alert-outline' : 'mdi:email-plus-outline'"
						class="size-8 text-warning shrink-0"
					/>
					<div>
						<h2 class="text-lg font-semibold">
							{{ hasEmail ? 'Verify Your Email' : 'Add an Email' }}
						</h2>
						<p class="text-sm text-muted mt-1">
							{{ promptText }}
						</p>
					</div>
				</div>

				<div
					v-if="hasEmail && currentEmail"
					class="rounded-lg bg-blue-500/10 border border-blue-500/30 p-3 text-sm"
				>
					<p class="font-medium">{{ currentEmail }}</p>
					<p class="text-xs text-muted">A 6-8 digit code will be sent to this address.</p>
				</div>

				<div
					v-if="error"
					class="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-200"
				>
					{{ error }}
				</div>

				<div
					v-if="sentMessage"
					class="rounded-lg bg-green-500/10 border border-green-500/30 p-3 text-sm"
				>
					<p class="font-medium">{{ sentMessage }}</p>
					<p class="text-xs">Check your inbox (and spam folder), then enter the code.</p>
				</div>

				<div class="flex flex-col gap-2 mt-2">
					<IonButton
						v-if="hasEmail"
						expand="block"
						color="primary"
						:disabled="sending"
						@click="sendCode"
					>
						<UIcon
							name="mdi:email-fast-outline"
							class="size-5 mr-2"
						/>
						{{ sending ? 'Sending…' : sentMessage ? 'Resend Code' : 'Send Verification Code' }}
					</IonButton>
					<IonButton
						expand="block"
						fill="outline"
						color="secondary"
						@click="goToVerify"
					>
						{{ hasEmail ? 'Go to Verification Page' : 'Add an Email in Profile' }}
					</IonButton>
					<IonButton
						expand="block"
						fill="clear"
						color="medium"
						:disabled="sending"
						@click="close"
						>Not Now</IonButton
					>
				</div>
			</div>
		</IonContent>
	</IonModal>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';

const gate = useEmailGate();
const router = useIonRouter();
const { user, sendVerificationEmail } = useAuth();

const open = computed(() => gate.open.value);
const sending = ref(false);
const sentMessage = ref<string | null>(null);
const error = ref<string | null>(null);

const hasEmail = computed(() => gate.hasEmail.value);
const currentEmail = computed(() => user.value?.account?.email ?? '');

const promptText = computed(() => {
	const action = gate.action.value || 'continue';
	if (hasEmail.value) {
		return `You need a verified email before you can ${action}. We'll send a one-time code to your address.`;
	}
	return `Add an email in your profile to ${action} and unlock account recovery, login alerts, and notifications.`;
});

function onDismiss() {
	if (sending.value) return;
	close();
}

function close() {
	sentMessage.value = null;
	error.value = null;
	gate.close();
}

async function sendCode() {
	if (sending.value) return;
	sending.value = true;
	error.value = null;
	try {
		const res = await sendVerificationEmail();
		if (res.success) {
			sentMessage.value = res.data?.message || 'Verification code sent.';
			await Toast.show({ text: 'Code sent — check your email.', duration: 'short' });
		} else {
			error.value = res.message || 'Failed to send verification code.';
		}
	} catch (e: any) {
		error.value = e?.data?.message || e?.message || 'Failed to send verification code.';
	} finally {
		sending.value = false;
	}
}

function goToVerify() {
	gate.close();
	router.navigate(hasEmail.value ? '/verify-email' : '/tabs/profile/editor', 'forward');
}
</script>
