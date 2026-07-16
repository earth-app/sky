<template>
	<IonCard
		:color="theme"
		:class="[
			'p-2 mb-4 notif-card',
			enterClass,
			isBadgeSource && !notification.read ? 'notif-badge-border' : '',
			isQuestSource ? 'notif-quest-border' : '',
			notification.read ? 'notif-read' : ''
		]"
		:style="enterStyle"
		@click="haptics.selection()"
	>
		<IonCardHeader>
			<div class="flex justify-between items-start mb-2">
				<IonCardTitle :router-link="routerLink">{{ notification.title }}</IonCardTitle>
				<div class="flex items-center px-2 py-1">
					<UIcon
						v-if="notification.type === 'error'"
						name="mdi:alert-circle-outline"
						class="text-red-400 size-5"
						title="Error Notification"
					/>
					<UIcon
						v-else-if="notification.type === 'warning'"
						name="mdi:alert-outline"
						class="text-yellow-400 size-5"
						size="20"
						title="Warning Notification"
					/>
					<UIcon
						v-else-if="notification.type === 'success' && additional"
						name="mdi:check-circle-outline"
						class="text-green-400 size-5"
						title="Success Notification"
						size="20"
					/>
					<Transition name="fade">
						<button
							v-if="!notification.read"
							type="button"
							title="Mark as Read"
							aria-label="Mark as Read"
							class="flex! items-center justify-center size-11! -m-3! p-0! bg-transparent! border-0!"
							@click.stop="markAsRead"
						>
							<span
								:class="['inline-block size-3 rounded-full pointer-events-none', unreadDotClass]"
							></span>
						</button>
					</Transition>
					<UIcon
						v-if="additional"
						name="mdi:delete-outline"
						class="size-5 text-gray-500"
						title="Delete Notification"
						@click.stop="removeNotification"
					/>
				</div>
			</div>
			<IonCardSubtitle :router-link="routerLink">{{
				trimString(notification.message, 50)
			}}</IonCardSubtitle>
		</IonCardHeader>

		<IonCardContent
			:router-link="routerLink"
			class="p-0!"
		>
			<div class="flex flex-col mt-2">
				<p class="text-xs! md:text-sm text-gray-400 light:text-gray-800">
					{{ timestamp }} | {{ fullTimestamp }}
				</p>
				<p class="text-xs! md:text-sm text-gray-600 light:text-gray-300">
					{{ notification.source }} | ID: {{ notification.id }}
				</p>
			</div>
		</IonCardContent>
	</IonCard>
</template>

<script setup lang="ts">
import { Dialog } from '@capacitor/dialog';
import { Toast } from '@capacitor/toast';
import { DateTime } from 'luxon';
import { trimString } from 'utils';
import { theme } from '~/composables/useSettings';

const props = defineProps<{
	notification: UserNotification;
	additional?: boolean;
	index?: number;
}>();

const emit = defineEmits<{
	(event: 'deleted', notification: UserNotification): void;
}>();
const { markNotificationRead } = useNotifications();
const haptics = useAppHaptics();

const timestamp = computed(() => {
	const time = DateTime.fromMillis(props.notification.created_at * 1000);
	return time.toRelative() || time.toLocaleString(DateTime.DATETIME_SHORT);
});

const fullTimestamp = computed(() => {
	const time = DateTime.fromMillis(props.notification.created_at * 1000);
	return time.toLocaleString(DateTime.DATETIME_FULL);
});

const routerLink = computed(() => `/tabs/profile/notifications/${props.notification.id}`);

// source-driven matrix, same shape as crust but Ionic-friendly (no canvas, CSS only)
const isQuestSource = computed(() => {
	const src = (props.notification.source || '').toLowerCase();
	return src === 'quest' || /quest/i.test(props.notification.title);
});
const isBadgeSource = computed(() => {
	const src = (props.notification.source || '').toLowerCase();
	return src === 'badge' || props.notification.title === 'New Badge Unlocked!';
});
const isFriendSource = computed(() => {
	const src = (props.notification.source || '').toLowerCase();
	return src === 'friend_request' || src === 'friend_accept' || src === 'friend';
});
const isMentionSource = computed(() => {
	const src = (props.notification.source || '').toLowerCase();
	return src === 'mention' || src === 'reply';
});

const enterClass = computed(() => {
	if (props.notification.type === 'error' || isMentionSource.value) return 'notif-enter-shake';
	if (isQuestSource.value) return 'notif-enter-quest';
	if (isBadgeSource.value) return 'notif-enter-fade';
	if (isFriendSource.value) return 'notif-enter-friend';
	return 'notif-enter-fade';
});

const enterStyle = computed(() => {
	const delay = (props.index ?? 0) * 80;
	return delay > 0 ? { animationDelay: `${delay}ms` } : undefined;
});

const unreadDotClass = computed(() => {
	if (props.notification.type === 'error') return 'bg-red-500 notif-dot-error';
	if (props.notification.type === 'warning') return 'bg-yellow-500 notif-dot-warning';
	if (isFriendSource.value) return 'bg-blue-500 notif-dot-friend';
	return 'bg-blue-500';
});

async function markAsRead() {
	if (!props.notification.read) {
		await haptics.selection();
		const res = await markNotificationRead(props.notification.id);
		if (!res.success) {
			console.error('Failed to mark notification as read:', res.message);

			await Toast.show({
				text: res.message || 'Failed to mark notification as read.',
				duration: 'short'
			});
		}
	}
}

async function removeNotification() {
	const { value } = await Dialog.confirm({
		title: 'Delete Notification?',
		message: "This notification will be removed permanently. You can't undo this.",
		okButtonTitle: 'Delete',
		cancelButtonTitle: 'Cancel'
	});
	if (!value) return;

	// queue the delete if offline so the dispatch happens on reconnect, the UI
	// emits 'deleted' immediately either way for optimistic feel
	const queued = await runOrQueueM('mark-notification-delete', { id: props.notification.id }, () =>
		deleteNotification(props.notification.id)
	);

	if (queued.queued) {
		emit('deleted', props.notification);
		await Toast.show({
			text: "Will delete once you're back online.",
			duration: 'short'
		});
		return;
	}

	const res = (queued.result as { success: boolean; message?: string }) ?? {
		success: false,
		message: 'Failed to delete notification.'
	};

	if (res.success) {
		emit('deleted', props.notification);

		await Toast.show({
			text: 'Notification deleted successfully.',
			duration: 'short'
		});
	} else {
		console.error('Failed to delete notification:', res.message);

		await Toast.show({
			text: res.message || 'Failed to delete notification.',
			duration: 'short'
		});
	}
}
</script>

<style scoped>
.notif-card {
	transition: opacity 200ms ease;
}
.notif-read {
	opacity: 0.7;
	filter: grayscale(0.2);
}

/* default enter, plain fade */
@keyframes notif-fade-in {
	0% {
		opacity: 0;
		transform: translateY(6px);
	}
	100% {
		opacity: 1;
		transform: translateY(0);
	}
}
.notif-enter-fade {
	animation: notif-fade-in 320ms ease-out both;
}

/* quest enter, fade + soft glow pulse (once) */
@keyframes notif-quest-in {
	0% {
		opacity: 0;
		box-shadow: 0 0 0 0 rgba(250, 204, 21, 0);
	}
	35% {
		opacity: 1;
		box-shadow: 0 0 16px 2px rgba(250, 204, 21, 0.45);
	}
	100% {
		opacity: 1;
		box-shadow: 0 0 0 0 rgba(250, 204, 21, 0);
	}
}
.notif-enter-quest {
	animation: notif-quest-in 1400ms ease-out both;
}
/* persistent quest border while unread keeps the card distinct in the list */
.notif-quest-border {
	border-left: 3px solid rgba(250, 204, 21, 0.7);
}

/* badge enter, conic-gradient border via pseudo for unread.
   rotate the gradient angle, not the element. rotating the pseudo with inset:-2px
   and no overflow clip paints diagonal streaks across the page. */
@property --notif-badge-angle {
	syntax: '<angle>';
	initial-value: 0deg;
	inherits: false;
}
.notif-badge-border {
	position: relative;
	isolation: isolate;
	overflow: hidden;
}
.notif-badge-border::before {
	content: '';
	position: absolute;
	inset: 0;
	border-radius: inherit;
	padding: 2px;
	background: conic-gradient(from var(--notif-badge-angle), #a855f7, #f59e0b, #3b82f6, #a855f7);
	-webkit-mask:
		linear-gradient(black, black) content-box,
		linear-gradient(black, black);
	-webkit-mask-composite: xor;
	mask:
		linear-gradient(black, black) content-box,
		linear-gradient(black, black);
	mask-composite: exclude;
	animation: notif-badge-spin 8s linear infinite;
	pointer-events: none;
	z-index: -1;
}
@keyframes notif-badge-spin {
	to {
		--notif-badge-angle: 360deg;
	}
}
/* older firefox doesn't support @property; skip the spin rather than have the
   ring sit static-but-glowing in the wrong place */
@supports not (background: paint(something)) {
	.notif-badge-border::before {
		animation: none;
	}
}

/* friend enter, small pulse on the dot via class on unread span */
@keyframes notif-friend-in {
	0% {
		opacity: 0;
		transform: scale(0.96);
	}
	100% {
		opacity: 1;
		transform: scale(1);
	}
}
.notif-enter-friend {
	animation: notif-friend-in 320ms ease-out both;
}
@keyframes notif-dot-friend-pulse {
	0%,
	100% {
		transform: scale(1);
		box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.6);
	}
	50% {
		transform: scale(1.15);
		box-shadow: 0 0 0 6px rgba(59, 130, 246, 0);
	}
}
.notif-dot-friend {
	animation: notif-dot-friend-pulse 1.6s ease-out infinite;
}

/* error/mention enter, one-shot shake */
@keyframes notif-shake {
	0%,
	100% {
		transform: translateX(0);
	}
	20% {
		transform: translateX(-4px);
	}
	40% {
		transform: translateX(4px);
	}
	60% {
		transform: translateX(-3px);
	}
	80% {
		transform: translateX(3px);
	}
}
.notif-enter-shake {
	animation: notif-shake 500ms ease-in-out both;
}

/* type-driven dot pulses for warning/error */
@keyframes notif-dot-warning {
	0%,
	100% {
		opacity: 0.55;
	}
	50% {
		opacity: 1;
	}
}
.notif-dot-warning {
	animation: notif-dot-warning 1600ms ease-in-out infinite;
}
@keyframes notif-dot-error {
	0%,
	100% {
		opacity: 0.5;
		transform: scale(1);
	}
	50% {
		opacity: 1;
		transform: scale(1.15);
	}
}
.notif-dot-error {
	animation: notif-dot-error 1100ms ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
	.notif-enter-fade,
	.notif-enter-quest,
	.notif-enter-friend,
	.notif-enter-shake,
	.notif-badge-border::before,
	.notif-dot-friend,
	.notif-dot-warning,
	.notif-dot-error {
		animation: none !important;
	}
}

.fade-enter-active,
.fade-leave-active {
	transition: opacity 200ms ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>
