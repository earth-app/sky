<template>
	<div>
		<!-- Web fallback -->
		<UFileUpload
			v-if="!isNative"
			accept="image/*"
			multiple
			icon="mdi:image-outline"
			color="secondary"
			highlight
			label="Upload Your Submission"
			description="PNG, JPG, WEBP, HEIC (max. 10MB each)"
			layout="grid"
			class="max-w-96 max-h-32"
			:preview="false"
			@update:model-value="handleUpload"
			:disabled="uploadDisabled"
		/>

		<IonButton
			v-else
			color="secondary"
			class="w-full max-w-96"
			@click="pickNativeImages"
			:disabled="uploadDisabled"
		>
			<UIcon
				name="mdi:image-outline"
				class="size-5 mr-2"
			/>
			Choose Images
		</IonButton>
	</div>

	<IonModal
		v-if="value"
		title="Confirm Submission"
		:is-open="modalOpen"
	>
		<div class="flex flex-col items-center">
			<img
				v-for="(blob, index) in valueBlobs"
				:key="index"
				:src="blob"
				alt="Submission Preview"
				class="h-auto max-h-screen max-w-screen rounded-xl shadow-md object-contain mb-4 border-2 border-info/50"
			/>
			<p class="text-center!">Are you sure you want to submit these image(s)?</p>
			<div class="flex">
				<IonButton
					color="danger"
					class="mt-4 mr-2"
					@click="value = []"
					:disabled="submitting"
				>
					<UIcon
						name="mdi:close"
						class="size-5 mr-2"
					/>
					Cancel
				</IonButton>
				<IonButton
					color="primary"
					class="mt-4"
					@click="submitUpload"
					icon="mdi:image-check-outline"
					:loading="submitting"
				>
					<UIcon
						name="mdi:image-check-outline"
						class="size-5 mr-2"
					/>
					Confirm
				</IonButton>
			</div>
		</div>
	</IonModal>
</template>

<script setup lang="ts">
import { Camera, MediaTypeSelection, type MediaResult } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Toast } from '@capacitor/toast';

const props = defineProps<{
	eventId: string;
}>();

const emit = defineEmits<{
	(e: 'submission', file: File): void;
}>();

const { user } = useAuth();
const { event, fetch, fetchSubmissionsForUser, submitImage } = useEvent(props.eventId);
const { checkImage } = useClientModeration();
const currentSubmissionsCount = ref(0);

const isNative = Capacitor.isNativePlatform();
const uploadDisabled = computed(() => {
	return (
		!event?.value?.is_attending ||
		(user.value ? currentSubmissionsCount.value >= 3 : true) ||
		event?.value?.fields?.cancelled ||
		!event?.value?.timing?.is_ongoing
	);
});

onMounted(() => {
	fetch();

	if (user.value)
		fetchSubmissionsForUser(user.value.id).then((subs) => {
			currentSubmissionsCount.value = subs.length;
		});
});
watch(
	() => user.value,
	(newUser) => {
		if (newUser) {
			fetchSubmissionsForUser(newUser.id).then((subs) => {
				currentSubmissionsCount.value = subs.length;
			});
		} else {
			currentSubmissionsCount.value = 0;
		}
	}
);

const value = ref<File[] | null>(null);
const modalOpen = ref(false);
watch(value, (newValue) => {
	if (newValue && newValue.length > 0) {
		modalOpen.value = true;
	} else {
		modalOpen.value = false;
	}
});

const valueBlobs = computed(() => {
	if (!value.value) return null;
	return value.value.map((file) => URL.createObjectURL(file));
});

async function pickNativeImages() {
	try {
		const remaining = 3 - currentSubmissionsCount.value;

		if (remaining <= 0) {
			await Toast.show({
				text: 'You can only submit up to 3 images.',
				duration: 'long'
			});

			return;
		}

		const { results } = await Camera.chooseFromGallery({
			quality: 90,
			limit: remaining,
			allowMultipleSelection: true,
			mediaType: MediaTypeSelection.Photo
		});

		if (!results.length) return;

		const files = await Promise.all(results.map(photoToFile));

		await handleUpload(files);
	} catch (err) {
		console.error('Native image picker error:', err);

		await Toast.show({
			text: 'Unable to select images.',
			duration: 'long'
		});
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

		return new File([blob], `upload-${Date.now()}.${extension}`, {
			type: mimeType,
			lastModified: Date.now()
		});
	} catch (err) {
		console.error('Failed to process selected image:', err);

		throw new Error('Failed to process selected image.');
	}
}

async function handleUpload(upload?: File[] | null) {
	if (!upload || upload.length === 0) {
		value.value = null;
		return;
	}

	if (upload.length + currentSubmissionsCount.value > 3) {
		await Toast.show({
			text: 'You can only upload up to 3 images per submission.',
			duration: 'long'
		});
		return;
	}

	if (upload.some((file) => file.size > 10 * 1024 * 1024)) {
		await Toast.show({
			text: 'Each image must be less than 10MB.',
			duration: 'long'
		});
		return;
	}

	if (!upload.some((file) => file.type.startsWith('image/'))) {
		await Toast.show({
			text: 'Only image files are allowed.',
			duration: 'long'
		});
		return;
	}

	// disallow animated images (e.g. animated webp, gif, png, etc.)
	{
		const results = await Promise.all(upload.map((file) => isAnimatedImage(file)));
		if (results.some(Boolean)) {
			await Toast.show({
				text: 'Animated images (e.g. animated WebP, GIF) are not allowed.',
				duration: 'long'
			});
			return;
		}
	}

	value.value = upload;
}

const submitting = ref(false);
async function submitUpload() {
	if (!value.value) return;

	submitting.value = true;

	// preventive client pre-check; server stays authoritative
	for (const file of value.value) {
		const verdict = await checkImage(file);
		if (!verdict.allowed) {
			submitting.value = false;
			await showErrorToast(undefined, {
				fallback: "This image looks explicit and can't be posted."
			});
			return;
		}
	}

	for (const file of value.value) {
		const res = await submitImage(file);
		if (valid(res)) {
			if ('code' in res.data) {
				console.error('Submission error:', res.data.message, 'Code:', res.data.code);
				await Toast.show({
					text: res.data.message,
					duration: 'long'
				});
				return;
			}

			// successful upload
			currentSubmissionsCount.value += 1;
			emit('submission', file);
		} else {
			if (res.message === 'Image submitted successfully') continue;

			console.error('Submission error:', res.message);
			await Toast.show({
				text: res.message || 'An unknown error occurred while submitting your image.',
				duration: 'long'
			});
		}
	}

	value.value = null;
	await Toast.show({
		text: 'Your image(s) have been successfully submitted.',
		duration: 'long'
	});

	await fetchSubmissionsForUser(user.value!.id).then((subs) => {
		currentSubmissionsCount.value = subs.length;
	});

	submitting.value = false;
}

// animation functions

async function readFileBytes(file: File, length = 64 * 1024): Promise<Uint8Array> {
	const slice = file.slice(0, length);
	return await new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = (e) => {
			const result = e.target?.result;
			if (result instanceof ArrayBuffer) resolve(new Uint8Array(result));
			else resolve(new Uint8Array());
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsArrayBuffer(slice);
	});
}

function bytesToString(bytes: Uint8Array): string {
	try {
		return new TextDecoder().decode(bytes);
	} catch (e) {
		return '';
	}
}

async function isAnimatedImage(file: File): Promise<boolean> {
	if (!file.type.startsWith('image/')) return false;
	const bytes = await readFileBytes(file);
	const text = bytesToString(bytes);

	if (file.type === 'image/webp') return isAnimatedWebPBytes(text);
	if (file.type === 'image/gif') return isAnimatedGIFBytes(text);
	if (file.type === 'image/png') return isAnimatedPNGBytes(text);
	if (file.type === 'image/heic' || file.type === 'image/heif') return isAnimatedHEICBytes(text);
	return false;
}

function isAnimatedWebPBytes(text: string): boolean {
	// ANIM chunk marks animated WebP
	return text.includes('ANIM');
}

function isAnimatedGIFBytes(text: string): boolean {
	// GIF headers for animated GIFs
	return text.startsWith('GIF89a') || text.startsWith('GIF87a');
}

function isAnimatedPNGBytes(text: string): boolean {
	// APNG contains the "acTL" chunk somewhere after the header
	return text.includes('acTL');
}

function isAnimatedHEICBytes(text: string): boolean {
	// Check for common HEIC/AV1 indicators in the ftyp/brand area
	return text.includes('heic') || text.includes('av01');
}
</script>
