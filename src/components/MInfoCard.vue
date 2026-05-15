<template>
	<IonCard
		:color="color"
		:router-link="inBrowser || link?.startsWith('http') ? undefined : link"
		:router-animation="slide"
		class="my-2 pt-2 shadow-md shadow-black/30 light:shadow-black/10"
		@click="
			async () => {
				if (inBrowser && link) {
					await Browser.open({ url: link });
				} else {
					if (link) {
						goTo(link);
					}
				}
			}
		"
	>
		<IonImg
			v-if="showCardImage"
			:src="image"
			alt="Card Image"
			class="mb-2"
		/>
		<IonCardHeader class="px-2">
			<IonCardTitle>
				<div class="flex items-center mb-2 text-gray-300 light:text-gray-700">
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
								() => {
									if (avatar?.link) {
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
							() => {
								if (avatar?.link) {
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
							class="font-sans text-sm! opacity-80 ml-2"
							@click="
								() => {
									if (subtitleLink) {
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
				<iframe
					:src="`https://www.youtube.com/embed/${youtubeId}?autoplay=0&mute=1&controls=1&rel=0&modestbranding=1&origin=${origin}`"
					class="w-full min-h-64 object-cover rounded-lg mb-2"
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
				></iframe>
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
					<p class="text-center text-gray-500">
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
					class="flex items-center py-1 px-3 font-semibold"
					@click="
						() => {
							if (badge.link) {
								goTo(badge.link);
							}
						}
					"
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
					@click="button.onClick"
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
				class="text-sm block mt-4 font-sans text-gray-300 light:text-gray-400 font-normal mb-2"
				>{{ footer }}</span
			>

			<span
				v-if="secondaryFooter"
				class="text-xs block font-sans text-gray-500 light:text-gray-400 mb-2"
				>{{ secondaryFooter }}</span
			>
		</IonCardContent>
	</IonCard>
</template>

<script setup lang="ts">
import { Browser } from '@capacitor/browser';
import { type Color } from '@ionic/core';
import slide from '~/animations/slide';

type Variant = 'outline' | 'clear' | 'fill';
type NuxtColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
type Size = 'default' | 'small' | 'large';
type NuxtSize = '3xs' | '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

const props = defineProps<{
	inBrowser?: boolean;
	variant?: Variant;
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
	iconSize?: string;
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
	imageLink?: string;
	youtubeId?: string;
	video?: string;
	object?: {
		url?: string;
		type?: string;
	};
	footer?: string;
	footerTooltip?: string;
	secondaryFooter?: string;
	additionalLinks?: {
		text: string;
		link: string;
		external?: boolean;
	}[];
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
}>();

const appSettings = useAppSettingsState();
const showCardImage = computed(() => Boolean(props.image && appSettings.value.cardThumbnails));

const origin = computed(() => {
	if (import.meta.client) {
		return encodeURIComponent(window.location.origin);
	}

	return encodeURIComponent('https://app.earth-app.com');
});

function goTo(url: string) {
	navigateTo(url, { external: url.startsWith('http') });
}
</script>
