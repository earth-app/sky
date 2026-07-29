<template>
	<IonCard
		:color="color"
		:router-link="inBrowser || link?.startsWith('http') ? undefined : link"
		:router-animation="slide"
		data-testid="info-card-slide"
		class="m-card-ion my-2 pt-2"
		@click="
			async () => {
				selection();
				if (!link) return;
				if (inBrowser) {
					await Browser.open({ url: link });
				} else if (link.startsWith('http')) {
					// router-link is disabled for external urls, so navigate here
					goTo(link);
				}
				// internal links are handled by :router-link to avoid double navigation
			}
		"
	>
		<div
			v-if="banner"
			class="mx-2 mb-2 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
			:class="[bannerTint, banner.link ? 'cursor-pointer min-h-11' : '']"
			:role="banner.link ? 'button' : 'note'"
			:tabindex="banner.link ? 0 : undefined"
			:aria-label="banner.link ? banner.text : undefined"
			@click.stop="onBannerActivate"
			@keydown.enter.prevent="onBannerActivate"
			@keydown.space.prevent="onBannerActivate"
		>
			<UIcon
				v-if="banner.icon"
				:name="banner.icon"
				class="size-4 shrink-0"
				aria-hidden="true"
			/>
			<span class="min-w-0 flex-1 text-xs font-semibold">{{ banner.text }}</span>
			<IonButton
				v-for="(action, index) in banner.actions ?? []"
				:key="`banner-action-${index}`"
				:color="action.color || banner.color || 'primary'"
				size="small"
				fill="clear"
				:aria-label="action.text"
				@click.stop="
					() => {
						selection();
						if (action.onClick) action.onClick();
					}
				"
			>
				<UIcon
					v-if="action.icon"
					:name="action.icon"
					class="mr-1 size-4"
				/>
				{{ action.text }}
			</IonButton>
		</div>

		<div
			v-if="showCardImage && !imageFailed"
			class="relative mb-2 aspect-video w-full overflow-hidden rounded-lg"
		>
			<MSkeleton
				v-if="!imageLoaded"
				height="100%"
				width="100%"
				class="absolute inset-0"
			/>
			<IonImg
				:src="image"
				:alt="imageAlt"
				class="size-full object-cover"
				@ionImgDidLoad="imageLoaded = true"
				@ionError="imageFailed = true"
			/>
		</div>
		<IonCardHeader class="px-2">
			<IonCardTitle>
				<div class="flex items-center mb-2 text-toned">
					<UChip
						v-if="avatar?.chip"
						inset
						:color="avatar.chip.color"
						:size="avatar.chip.size || 'md'"
					>
						<UAvatar
							:size="avatar.size || 'md'"
							:src="avatar.src"
							class="mr-2"
							@click="
								(e: Event) => {
									if (avatar?.link) {
										e.stopPropagation();
										goTo(avatar.link);
									}
								}
							"
						/>
					</UChip>
					<UAvatar
						v-else-if="avatar"
						:size="avatar.size || 'md'"
						:src="avatar.src"
						class="mr-2"
						@click="
							(e: Event) => {
								if (avatar?.link) {
									e.stopPropagation();
									goTo(avatar.link);
								}
							}
						"
					/>
					<UIcon
						v-if="!avatar && icon"
						:name="icon"
						class="size-8 min-w-8 mr-2 mt-0.5"
					/>
					<div class="flex flex-col">
						<span
							v-if="title"
							class="font-sans text-xl! ml-2"
							>{{ title }}</span
						>
						<span
							v-if="subtitle"
							class="ml-2"
							:class="title ? 'opacity-80 font-sans text-sm!' : 'text-base!'"
							@click="
								(e: Event) => {
									if (subtitleLink) {
										e.stopPropagation();
										goTo(subtitleLink);
									}
								}
							"
							>{{ subtitle }}</span
						>
					</div>

					<div class="ml-auto">
						<UChip
							v-if="secondaryAvatar?.chip"
							inset
							:color="secondaryAvatar.chip.color"
							:size="secondaryAvatar.chip.size || 'sm'"
							class="ml-2"
						>
							<UAvatar
								:size="secondaryAvatar.size || 'sm'"
								:src="secondaryAvatar.src"
							/>
						</UChip>
						<UAvatar
							v-else-if="secondaryAvatar"
							:size="secondaryAvatar.size || 'sm'"
							:src="secondaryAvatar.src"
							class="ml-2"
						/>
					</div>
				</div>
			</IonCardTitle>
			<IonCardSubtitle
				v-if="description"
				:router-link="descriptionLink"
				class="mb-2"
			>
				{{ description }}
			</IonCardSubtitle>
		</IonCardHeader>

		<IonCardContent class="w-full py-1! px-2!">
			<span
				v-if="content"
				class="font-sans"
				>{{ content }}</span
			>

			<LazyClientOnly
				v-if="youtubeId"
				hydrate-on-visible
			>
				<button
					v-if="isNativeWebView"
					type="button"
					class="relative w-full min-h-64 mb-2 rounded-lg overflow-hidden block bg-black active:opacity-90 transition-opacity group"
					@click.stop.prevent="openYouTubeExternally"
				>
					<img
						v-if="youtubeThumbnailSrc"
						:src="youtubeThumbnailSrc"
						:alt="`YouTube video for ${title}`"
						class="absolute inset-0 w-full h-full object-cover"
						loading="lazy"
						decoding="async"
					/>
					<div
						class="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-black/60"
					></div>
					<div class="relative w-full h-full flex items-center justify-center min-h-64">
						<div
							class="size-16 rounded-xl bg-black/60 group-active:bg-red-600 transition-colors flex items-center justify-center backdrop-blur-sm"
						>
							<UIcon
								name="mdi:play"
								class="size-8 text-white"
							/>
						</div>
					</div>
				</button>
				<div
					v-else
					class="relative w-full min-h-64 mb-2"
				>
					<iframe
						v-if="!youtubeFailed"
						:src="youtubeEmbedSrc"
						:title="`YouTube video for ${title}`"
						class="w-full min-h-64 object-cover rounded-lg"
						allow="
							accelerometer;
							autoplay;
							clipboard-write;
							encrypted-media;
							gyroscope;
							picture-in-picture;
						"
						allowfullscreen
						loading="lazy"
						referrerpolicy="strict-origin-when-cross-origin"
						@error="youtubeFailed = true"
					></iframe>
					<button
						v-else
						type="button"
						class="w-full min-h-64 rounded-lg flex flex-col items-center justify-center gap-2 bg-black/40 light:bg-black/10 text-sm hover:bg-black/50 transition-colors"
						@click="openYouTubeExternally"
					>
						<UIcon
							name="mdi:youtube"
							class="size-10 text-red-500"
						/>
						<span class="text-center px-4">Couldn't load the player. Tap to watch on YouTube.</span>
					</button>
				</div>
			</LazyClientOnly>
			<LazyClientOnly
				v-if="video"
				hydrate-on-visible
			>
				<video
					class="w-full min-h-64 object-cover rounded-lg mb-2"
					controls
					loading="lazy"
					preload="metadata"
				>
					<source
						v-if="video.endsWith('.mp4')"
						:src="video"
						type="video/mp4"
					/>
					<source
						v-if="video.endsWith('.webm')"
						:src="video"
						type="video/webm"
					/>
				</video>
			</LazyClientOnly>
			<LazyClientOnly
				v-if="object?.url"
				hydrate-on-visible
			>
				<video
					v-if="object?.type?.startsWith('video/')"
					:src="object.url"
					controls
					preload="metadata"
					class="w-full min-h-64 object-cover rounded-lg mb-2"
				></video>

				<audio
					v-else-if="object?.type?.startsWith('audio/')"
					:src="object.url"
					controls
					preload="metadata"
					class="w-full object-cover rounded-lg mb-2"
				></audio>

				<object
					v-else
					:data="object.url"
					:type="object.type || undefined"
					class="w-full min-h-64 object-cover rounded-lg mb-2"
				>
					<p class="text-center text-muted">
						Unable to display content. <br />
						<a
							:href="object.url"
							target="_blank"
							rel="noopener noreferrer"
							class="text-blue-500 hover:underline"
						>
							View here.
						</a>
					</p>
				</object>
			</LazyClientOnly>

			<div
				v-if="badges"
				class="flex gap-2 flex-wrap my-2"
			>
				<IonChip
					v-for="(badge, index) in badges"
					:key="index"
					:outline="badge.outline"
					:color="badge.color"
					:role="badge.link ? 'link' : undefined"
					:tabindex="badge.link ? 0 : undefined"
					:aria-label="badge.link ? `Open ${badge.text}` : undefined"
					class="flex items-center py-1 px-3 font-semibold"
					:class="badge.link ? 'min-h-11' : ''"
					@click="
						(e: Event) => {
							selection();
							if (badge.link) {
								e.stopPropagation();
								goTo(badge.link);
							}
						}
					"
					@keydown.enter.prevent="activateBadge"
					@keydown.space.prevent="activateBadge"
				>
					<UIcon
						v-if="badge.icon"
						:name="badge.icon"
						class="mr-1"
					/>
					<IonLabel>{{ badge.text }}</IonLabel>
					<UIcon
						v-if="badge.trailingIcon"
						:name="badge.trailingIcon"
					/>
				</IonChip>
			</div>

			<div
				v-if="buttons"
				class="flex flex-wrap gap-2 mt-4"
			>
				<IonButton
					v-for="(button, index) in buttons"
					:key="index"
					:color="button.color"
					:size="button.size || 'default'"
					@click.stop="
						() => {
							selection();
							if (button.onClick) button.onClick();
						}
					"
					:disabled="button.disabled"
				>
					{{ button.text }}
				</IonButton>
			</div>
			<div
				v-if="avatarGroup"
				class="mt-2"
			>
				<UAvatarGroup :max="avatarGroup.max">
					<UAvatar
						v-for="(avatar, index) in avatarGroup.avatars"
						:key="`avatar-group-${index}`"
						:src="avatar.src"
						:alt="avatar.alt"
						:icon="avatar.icon"
						:size="avatarGroup.size || 'md'"
						:chip="avatar.chip || undefined"
					/>
				</UAvatarGroup>
			</div>

			<span
				v-if="footer"
				class="text-sm block mt-4 font-sans text-toned font-normal mb-2"
				>{{ footer }}</span
			>

			<span
				v-if="secondaryFooter"
				class="text-xs block font-sans text-muted mb-2"
				>{{ secondaryFooter }}</span
			>

			<ReportMButton
				v-if="report"
				:content-type="report.contentType"
				:content-id="report.contentId"
				:parent-id="report.parentId"
				:extra-actions="report.extraActions"
				class="z-10"
			/>
		</IonCardContent>
	</IonCard>
</template>

<script setup lang="ts">
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { type Color } from '@ionic/core';
import slide from '~/animations/slide';

type Variant = 'outline' | 'clear' | 'fill';
type NuxtColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
type Size = 'default' | 'small' | 'large';
type NuxtSize = '3xs' | '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

const props = defineProps<{
	inBrowser?: boolean;
	badges?: {
		text: string;
		color?: Color;
		size?: Size;
		icon?: string;
		variant?: Variant;
		link?: string;
		trailingIcon?: string;
		outline?: boolean;
	}[];
	title?: string;
	subtitle?: string;
	subtitleLink?: string;
	description?: string;
	descriptionLink?: string;
	content?: string;
	link?: string;
	icon?: string;
	avatar?: {
		src?: string;
		link?: string;
		size?: NuxtSize;
		chip?: {
			color?: NuxtColor;
			size?: NuxtSize;
		};
	};
	secondaryAvatar?: {
		src?: string;
		size?: NuxtSize;
		chip?: {
			color?: NuxtColor;
			size?: NuxtSize;
		};
	};
	image?: string;
	youtubeId?: string;
	video?: string;
	object?: {
		url?: string;
		type?: string;
	};
	footer?: string;
	secondaryFooter?: string;
	buttons?: {
		text: string;
		icon?: string;
		variant?: Variant;
		color?: Color;
		size?: Size;
		disabled?: boolean;
		onClick?: () => void;
	}[];
	avatarGroup?: {
		avatars: {
			src?: string;
			alt?: string;
			link?: string;
			icon?: string;
			chip?: {
				inset?: boolean;
				color?: NuxtColor;
				size?: NuxtSize;
			};
		}[];
		size?: NuxtSize;
		max?: number;
	};
	banner?: {
		color?: NuxtColor;
		text: string;
		icon?: string;
		link?: string;
		actions?: {
			text: string;
			icon?: string;
			color?: NuxtColor;
			size?: NuxtSize;
			onClick?: () => void;
		}[];
	};
	color?: Color;
	report?: {
		contentType: ContentType;
		contentId: string;
		parentId?: string;
		extraActions?: {
			text: string;
			role?: 'destructive' | 'cancel';
			handler: Function;
		}[];
	};
}>();

const appSettings = useAppSettingsState();
const { selection } = useAppHaptics();
const showCardImage = computed(() => Boolean(props.image && appSettings.value.cardThumbnails));

// warning/error text needs the -700 step to clear AA on a tinted fill; the rest read fine
const BANNER_TINT: Record<NuxtColor, string> = {
	primary: 'bg-primary/10 border-primary/25 m-text-brand',
	secondary: 'bg-secondary/10 border-secondary/25 text-secondary',
	success: 'bg-success/10 border-success/25 text-success',
	warning: 'bg-warning/10 border-warning/25 m-text-warning',
	error: 'bg-error/10 border-error/25 m-text-danger',
	info: 'bg-info/10 border-info/25 text-info'
};

const bannerTint = computed(() => BANNER_TINT[props.banner?.color ?? 'primary']);

function onBannerActivate() {
	if (!props.banner?.link) return;
	selection();
	goTo(props.banner.link);
}

// ion-chip has no keyboard activation of its own; a synthetic click reuses its own handler
function activateBadge(event: KeyboardEvent) {
	(event.currentTarget as HTMLElement | null)?.click();
}

// hide on error rather than letting Ionic render the broken-image placeholder
const imageFailed = ref(false);
const imageLoaded = ref(false);
watch(
	() => props.image,
	() => {
		imageFailed.value = false;
		imageLoaded.value = false;
	}
);

// the aspect box reserves the space, so the alt only has to name the content
const imageAlt = computed(() => (props.title ? `${props.title} thumbnail` : 'Card thumbnail'));

const isNativeWebView = computed(() => {
	if (!import.meta.client) return false;
	if (Capacitor.isNativePlatform()) return true;

	if (typeof window !== 'undefined') {
		const host = window.location.hostname || '';
		const proto = window.location.protocol || '';
		if (proto === 'capacitor:' || proto === 'file:') return true;
		if (host === 'localhost' || host === '127.0.0.1') return true;
	}

	return false;
});

const origin = computed(() => {
	if (isNativeWebView.value) return null;
	if (import.meta.client) return encodeURIComponent(window.location.origin);
	return null;
});

// strict YouTube id format so we don't ship malformed urls to the thumbnail or embed
const isValidYoutubeId = computed(
	() => typeof props.youtubeId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(props.youtubeId)
);

// web-only; native renders a thumbnail card + tap-to-open instead because WKWebView
// drops cross-origin iframes silently (no @error). see template for the native branch.
const youtubeEmbedSrc = computed(() => {
	if (!isValidYoutubeId.value) return '';
	if (isNativeWebView.value) return '';

	const base = `https://www.youtube-nocookie.com/embed/${props.youtubeId}`;
	const params = [
		'autoplay=0',
		'mute=1',
		'controls=1',
		'rel=0',
		'modestbranding=1',
		'playsinline=1'
	];
	if (origin.value) params.push(`origin=${origin.value}`);
	return `${base}?${params.join('&')}`;
});

const youtubeThumbnailSrc = computed(() =>
	isValidYoutubeId.value ? `https://i.ytimg.com/vi/${props.youtubeId}/hqdefault.jpg` : ''
);

const youtubeFailed = ref(false);
function openYouTubeExternally() {
	if (!props.youtubeId) return;
	const url = `https://www.youtube.com/watch?v=${props.youtubeId}`;
	if (Capacitor.isNativePlatform()) {
		void Browser.open({ url });
	} else if (typeof window !== 'undefined') {
		window.open(url, '_blank', 'noopener');
	}
}

function goTo(url: string) {
	navigateTo(url, { external: url.startsWith('http') });
}
</script>
