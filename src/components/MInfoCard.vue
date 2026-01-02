<template>
	<IonCard
		:color="color"
		:href="link"
		class="my-2 pt-2 shadow-md shadow-black/30 light:shadow-black/10"
	>
		<IonImg
			v-if="image"
			:src="image"
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
						/>
					</UChip>
					<UAvatar
						v-else-if="avatar"
						:size="avatar.size || 'md'"
						:src="avatar.src"
						class="mr-2"
					/>
					<UIcon
						v-if="!avatar && icon"
						:name="icon"
						class="size-8 mr-2 mt-0.5"
					/>
					<div class="flex flex-col">
						<span
							v-if="title"
							class="font-sans text-xl! ml-2"
							>{{ title }}</span
						>
						<span
							v-if="subtitle"
							class="font-sans text-base! ml-4"
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
				class="mb-2"
			>
				{{ description }}
			</IonCardSubtitle>
		</IonCardHeader>

		<IonCardContent class="w-full py-0! px-1!">
			<span
				v-if="content"
				class="font-sans"
				>{{ content }}</span
			>

			<div
				v-if="badges"
				class="flex gap-2 flex-wrap my-2"
			>
				<IonChip
					v-for="(badge, index) in badges"
					:key="index"
					:outline="badge.outline"
					:color="badge.color"
					class="py-1 px-3 font-semibold"
				>
					<UIcon
						v-if="badge.icon"
						:name="badge.icon"
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
				class="flex gap-2 mt-4"
			>
				<IonButton
					v-for="(button, index) in buttons"
					:key="index"
					:color="button.color"
					:size="button.size || 'default'"
					@click="button.onClick"
				>
					{{ button.text }}
				</IonButton>
			</div>

			<span
				v-if="footer"
				class="text-sm block mt-4 font-sans font-medium"
				>{{ footer }}</span
			>

			<span
				v-if="secondaryFooter"
				class="text-xs block font-sans text-gray-500 light:text-gray-400"
				>{{ secondaryFooter }}</span
			>
		</IonCardContent>
	</IonCard>
</template>

<script setup lang="ts">
import { type Color } from '@ionic/core';

defineProps<{
	title?: string;
	subtitle?: string;
	description?: string;
	content?: string;
	image?: string;
	avatar?: {
		src?: string;
		size?: 'md' | '3xs' | '2xs' | 'xs' | 'sm' | 'lg' | 'xl' | '2xl' | '3xl';
		chip?: {
			color: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral';
			size?: 'md' | '3xs' | '2xs' | 'xs' | 'sm' | 'lg' | 'xl' | '2xl' | '3xl';
		};
	};
	secondaryAvatar?: {
		src?: string;
		size?: 'md' | '3xs' | '2xs' | 'xs' | 'sm' | 'lg' | 'xl' | '2xl' | '3xl';
		chip?: {
			color: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral';
			size?: 'md' | '3xs' | '2xs' | 'xs' | 'sm' | 'lg' | 'xl' | '2xl' | '3xl';
		};
	};
	icon?: string;
	link?: string;
	footer?: string;
	secondaryFooter?: string;
	badges?: {
		text: string;
		icon?: string;
		trailingIcon?: string;
		color?: Color;
		outline?: boolean;
	}[];
	buttons?: {
		text: string;
		color?: Color;
		size?: 'small' | 'default' | 'large';
		onClick: () => void;
	}[];
	color?: Color;
}>();
</script>
