<template>
	<div class="w-full">
		<UFormField
			label="Thumbnail"
			name="thumbnail_url"
			help="Upload or select a thumbnail image"
		>
			<div class="space-y-2">
				<!-- Web fallback -->
				<UFileUpload
					v-if="!isNative"
					v-model="thumbnailFile"
					accept="image/*"
					icon="mdi:image-outline"
					color="secondary"
					highlight
					label="Upload Thumbnail"
					class="w-full min-h-50"
					:disabled="loading"
				/>

				<!-- Native platform button -->
				<IonButton
					v-else
					color="secondary"
					class="w-full"
					@click="pickNativeImage"
					:disabled="loading"
				>
					<UIcon
						name="mdi:image-outline"
						class="size-5 mr-2"
					/>
					Choose Thumbnail
				</IonButton>

				<!-- Preview -->
				<div
					v-if="thumbnailPreview"
					class="relative inline-block"
				>
					<img
						:src="thumbnailPreview"
						alt="Thumbnail preview"
						class="w-full max-w-sm max-h-48 rounded border-2 border-info/50"
					/>
					<IonButton
						color="danger"
						size="small"
						class="absolute top-2 right-2"
						@click="clearThumbnail"
						:disabled="loading"
					>
						<UIcon
							name="mdi:close"
							class="size-5"
						/>
					</IonButton>
				</div>
			</div>
		</UFormField>
	</div>
</template>

<script setup lang="ts">
import { Camera, MediaTypeSelection, type MediaResult } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Toast } from '@capacitor/toast';

const props = defineProps<{
	thumbnailUrlProp?: string;
}>();

const isNative = Capacitor.isNativePlatform();
const loading = ref(false);
const thumbnailFile = ref<File | null>(null);
const thumbnailPreview = ref<string | null>(null);

const emit = defineEmits<{
	(event: 'update:thumbnail', value: string): void;
	(event: 'update:thumbnailFile', value: File | null): void;
}>();

// Watch for file changes and create blob preview
watch(thumbnailFile, (newFile) => {
	// Clean up old blob URL
	if (thumbnailPreview.value && thumbnailPreview.value.startsWith('blob:')) {
		URL.revokeObjectURL(thumbnailPreview.value);
	}

	if (newFile) {
		// Create new blob URL for preview
		thumbnailPreview.value = URL.createObjectURL(newFile);
		emit('update:thumbnailFile', newFile);
		emit('update:thumbnail', thumbnailPreview.value);
	} else {
		thumbnailPreview.value = null;
		emit('update:thumbnailFile', null);
		emit('update:thumbnail', '');
	}
});

// Watch for URL changes from prop
watch(
	() => props.thumbnailUrlProp,
	(newUrl) => {
		if (newUrl && !thumbnailFile.value) {
			thumbnailPreview.value = newUrl;
		}
	}
);

async function pickNativeImage() {
	try {
		loading.value = true;

		const { results } = await Camera.chooseFromGallery({
			quality: 90,
			limit: 1,
			allowMultipleSelection: false,
			mediaType: MediaTypeSelection.Photo
		});

		if (!results.length) {
			loading.value = false;
			return;
		}

		const result = results[0];
		if (!result) {
			loading.value = false;
			return;
		}

		const file = await photoToFile(result);
		await handleUpload(file);
	} catch (err) {
		console.error('Native image picker error:', err);

		await Toast.show({
			text: 'Unable to select image.',
			duration: 'long'
		});
	} finally {
		loading.value = false;
	}
}

async function photoToFile(media: MediaResult): Promise<File> {
	if (!media.webPath && !media.uri) {
		throw new Error('Missing media webPath or uri');
	}

	try {
		const safePath = media.webPath || Capacitor.convertFileSrc(media.uri!);

		const response = await globalThis.fetch(safePath);
		if (!response.ok) {
			throw new Error(`Failed to fetch image: ${response.status}`);
		}

		const blob = await response.blob();
		const mimeType = blob.type || 'image/jpeg';
		const extension = media.metadata?.format || mimeType.split('/')[1] || 'jpg';

		return new File([blob], `thumbnail-${Date.now()}.${extension}`, {
			type: mimeType,
			lastModified: Date.now()
		});
	} catch (err) {
		console.error('Failed to process selected image:', err);
		throw new Error('Failed to process selected image.');
	}
}

async function handleUpload(file: File) {
	if (!file) {
		thumbnailFile.value = null;
		return;
	}

	if (file.size > 10 * 1024 * 1024) {
		await Toast.show({
			text: 'Image must be less than 10MB.',
			duration: 'long'
		});
		return;
	}

	if (!file.type.startsWith('image/')) {
		await Toast.show({
			text: 'Only image files are allowed.',
			duration: 'long'
		});
		return;
	}

	thumbnailFile.value = file;
}

const clearThumbnail = () => {
	// Clean up blob URL
	if (thumbnailPreview.value && thumbnailPreview.value.startsWith('blob:')) {
		URL.revokeObjectURL(thumbnailPreview.value);
	}

	thumbnailFile.value = null;
	thumbnailPreview.value = null;

	emit('update:thumbnailFile', null);
	emit('update:thumbnail', '');
};

// Cleanup on unmount
onBeforeUnmount(() => {
	if (thumbnailPreview.value && thumbnailPreview.value.startsWith('blob:')) {
		URL.revokeObjectURL(thumbnailPreview.value);
	}
});

defineExpose({
	thumbnailFile,
	thumbnailPreview
});
</script>
