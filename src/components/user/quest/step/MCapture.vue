<template>
	<div
		class="relative min-h-96 min-w-1/4 aspect-3/4 overflow-hidden bg-neutral-950 border-8 border-neutral-900/40 rounded-2xl! p-8! max-h-[80vh]"
	>
		<div
			v-if="stage === 'permission'"
			class="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8 text-center"
		>
			<div
				class="w-20 h-20 rounded-full border-2 border-lime-400 flex items-center justify-center animate-ring-pulse"
			>
				<UIcon
					name="i-lucide-camera"
					class="text-3xl text-lime-400"
				/>
			</div>
			<p class="text-[0.8rem]! font-semibold! tracking-[0.12em] uppercase text-neutral-100!">
				Take a Photo
			</p>
			<p class="text-[0.72rem] text-neutral-500 leading-[1.65]">
				This component uses your device camera directly.<br />No file uploads are permitted.
			</p>
			<button
				v-if="supportsFlip"
				class="px-4! py-2! rounded-xl! border border-neutral-700 text-white text-xs! font-medium! tracking-wide"
				@click="flipCamera"
			>
				Use {{ facingLabel }} Camera
			</button>
			<button
				class="mt-1! px-6! py-2.5! rounded-xl! bg-neutral-800! text-white text-sm! font-medium! tracking-wide"
				@click="startCamera"
			>
				Continue
			</button>
		</div>

		<div
			v-else-if="stage === 'capturing'"
			class="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8 text-center"
		>
			<div
				class="w-20 h-20 rounded-full border-2 border-lime-400 flex items-center justify-center animate-ring-pulse"
			>
				<UIcon
					name="i-lucide-camera"
					class="text-3xl text-lime-400"
				/>
			</div>
			<p class="text-[0.8rem]! font-semibold! tracking-[0.12em] uppercase text-neutral-100!">
				Opening Camera
			</p>
			<p class="text-[0.72rem] text-neutral-500 leading-[1.65]">
				Your camera app or picker should open now.<br />If it does not, tap retry.
			</p>
			<button
				class="mt-1! px-6! py-2.5! rounded-xl! bg-neutral-800! text-white text-sm! font-medium! tracking-wide"
				@click="startCamera"
			>
				Retry
			</button>
		</div>

		<div
			v-else-if="stage === 'error'"
			class="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8 text-center"
		>
			<div class="w-20 h-20 rounded-full border-2 border-red-500 flex items-center justify-center">
				<UIcon
					name="i-lucide-camera-off"
					class="text-3xl text-red-400"
				/>
			</div>
			<p class="text-[0.8rem]! font-medium! tracking-[0.12em] uppercase text-red-400!">
				Camera Unavailable
			</p>
			<p class="text-[0.72rem]! text-neutral-500! leading-[1.65]!">{{ errorMsg }}</p>
			<button
				class="mt-2! px-6! py-2! rounded-xl! border border-neutral-700 text-white text-sm!"
				@click="startCamera"
			>
				Try Again
			</button>
		</div>

		<div
			v-else-if="stage === 'preview'"
			class="absolute inset-0 flex flex-col"
		>
			<img
				:src="previewSrc"
				class="w-full! h-full! object-cover! block!"
				:class="{ '-scale-x-100': facingMode === 'user' && supportsFlip }"
				alt="Captured photo"
			/>

			<span class="absolute top-4 left-4 w-7 h-7 border-t-2 border-l-2 border-white/40" />
			<span class="absolute top-4 right-4 w-7 h-7 border-t-2 border-r-2 border-white/40" />
			<span class="absolute bottom-4 left-4 w-7 h-7 border-b-2 border-l-2 border-white/40" />
			<span class="absolute bottom-4 right-4 w-7 h-7 border-b-2 border-r-2 border-white/40" />

			<div
				class="absolute top-0 left-0 right-0 flex items-center px-4 pt-4 pb-8"
				style="background: linear-gradient(to bottom, rgba(0, 0, 0, 0.55), transparent)"
			>
				<span
					class="ml-2 mt-2 text-[0.65rem] tracking-[0.14em] uppercase text-white/50 px-2 py-0.5 border border-white/15 rounded bg-white/[0.07]"
				>
					PREVIEW
				</span>
			</div>

			<div
				class="absolute bottom-0 left-0 right-0 flex items-center justify-between px-8 py-5 pb-7"
				style="background: linear-gradient(to top, rgba(0, 0, 0, 0.65), transparent)"
			>
				<button
					class="w-12! h-12! rounded-full! border border-red-500/50 bg-black/30 backdrop-blur-sm flex items-center justify-center text-red-400 cursor-pointer hover:border-red-400 transition-colors duration-200"
					aria-label="Retake"
					@click="rejectPhoto"
				>
					<UIcon
						name="i-lucide-x"
						class="text-xl"
					/>
				</button>

				<button
					class="size-19! rounded-full! flex items-center justify-center transition-all duration-100 border-none!"
					:class="
						props.disabled
							? 'bg-lime-400/40 cursor-not-allowed'
							: 'bg-lime-400 cursor-pointer hover:bg-lime-300 active:scale-90 [box-shadow:0_0_28px_rgb(163_230_53/0.45)]'
					"
					:disabled="props.disabled"
					aria-label="Accept photo"
					@click="acceptPhoto"
				>
					<UIcon
						name="i-lucide-check"
						class="text-3xl text-neutral-900"
					/>
				</button>

				<div class="w-12 h-12" />
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { Camera, CameraDirection, type MediaResult } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { Toast } from '@capacitor/toast';

const props = defineProps<{
	disabled?: boolean;
}>();

const emit = defineEmits<{
	capture: [file: File];
	'photo-taken': [];
	'photo-rejected': [];
}>();

const {
	require: requirePermission,
	ensure: ensurePermission,
	prime: primePermission
} = useQuestPermissions();

// Front-load the camera prompt so the OS dialog appears when the step opens
// rather than after the user taps Continue.
onMounted(() => {
	if (props.disabled) return;
	void primePermission('camera');
});

type CameraStage = 'permission' | 'capturing' | 'preview' | 'error';

const stage = ref<CameraStage>('permission');
const errorMsg = ref('');
const facingMode = ref<'environment' | 'user'>('environment');

const previewSrc = ref<string>('');
const previewFile = ref<File | null>(null);

const supportsFlip = computed(() => Capacitor.getPlatform() !== 'android');
const facingLabel = computed(() => (facingMode.value === 'environment' ? 'front' : 'rear'));

async function startCamera() {
	if (props.disabled) {
		await Toast.show({
			text: 'This step is currently unavailable.',
			duration: 'short',
			position: 'bottom'
		});
		return;
	}

	const permission = await requirePermission('camera');
	if (!permission) {
		stage.value = 'error';
		errorMsg.value =
			'Camera access is required to complete this quest step. Please allow it in your device settings.';
		return;
	}

	void takePhoto();
}

async function flipCamera() {
	if (props.disabled) return;
	facingMode.value = facingMode.value === 'environment' ? 'user' : 'environment';
}

function formatExtension(format?: string): string {
	const normalized = (format || 'jpeg').toLowerCase();
	return normalized === 'jpeg' ? 'jpg' : normalized;
}

function formatMime(format?: string): string {
	const ext = formatExtension(format);
	if (ext === 'jpg') return 'image/jpeg';
	return `image/${ext}`;
}

function base64ToBlob(base64: string, mime: string): Blob {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return new Blob([bytes], { type: mime });
}

async function blobToBase64(data: string | Blob): Promise<string> {
	if (typeof data === 'string') return data;
	const bytes = new Uint8Array(await data.arrayBuffer());
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
	return btoa(binary);
}

function photoPreviewSrc(photo: MediaResult): string {
	if (photo.webPath) return photo.webPath;
	if (photo.thumbnail) {
		return `data:${formatMime(photo.metadata?.format)};base64,${photo.thumbnail}`;
	}
	return '';
}

function isCancelError(err: unknown): boolean {
	if (!err) return false;
	const code = (err as { code?: string }).code;
	const message = String((err as { message?: string }).message || err);
	return (
		code === 'OS-PLUG-CAMR-0006' ||
		code === 'OS-PLUG-CAMR-0020' ||
		/cancel|canceled|cancelled/i.test(message)
	);
}

async function photoToFile(photo: MediaResult): Promise<File | null> {
	const ext = formatExtension(photo.metadata?.format);
	const filename = `capture-${Date.now()}.${ext}`;
	if (photo.webPath) {
		const response = await fetch(photo.webPath);
		const blob = await response.blob();
		const mime = blob.type || formatMime(photo.metadata?.format);
		return new File([blob], filename, { type: mime });
	}
	if (photo.uri) {
		try {
			const data = await Filesystem.readFile({ path: photo.uri });
			const base64 = await blobToBase64(data.data);
			const mime = formatMime(photo.metadata?.format);
			return new File([base64ToBlob(base64, mime)], filename, { type: mime });
		} catch {
			// Fall through to any thumbnail/base64 data available below.
		}
	}
	if (photo.thumbnail) {
		const mime = formatMime(photo.metadata?.format);
		return new File([base64ToBlob(photo.thumbnail, mime)], filename, { type: mime });
	}
	return null;
}

async function takePhoto() {
	stage.value = 'capturing';
	// startCamera() already prompted (and surfaced the denial dialog) before we got
	// here; this is a silent backup guard for the retake path.
	const granted = await ensurePermission('camera');
	if (!granted) {
		stage.value = 'error';
		errorMsg.value =
			'Camera access is required to complete this quest step. Please allow it in your device settings.';
		return;
	}

	try {
		const photo = await Camera.takePhoto({
			quality: 92,
			includeMetadata: true,
			saveToGallery: false,
			...(supportsFlip.value
				? {
						cameraDirection:
							facingMode.value === 'user' ? CameraDirection.Front : CameraDirection.Rear
					}
				: {})
		});
		const file = await photoToFile(photo);
		const preview = photoPreviewSrc(photo);
		if (!file || !preview) {
			stage.value = 'error';
			errorMsg.value = 'Unable to load the captured photo. Please try again.';
			return;
		}
		previewFile.value = file;
		previewSrc.value = preview;
		stage.value = 'preview';
		emit('photo-taken');
	} catch (e: unknown) {
		if (isCancelError(e)) {
			stage.value = 'permission';
			return;
		}
		stage.value = 'error';
		errorMsg.value = 'Unable to access your camera. Make sure no other app is using it.';
	}
}

function rejectPhoto() {
	previewSrc.value = '';
	previewFile.value = null;
	emit('photo-rejected');
	void takePhoto();
}

function acceptPhoto() {
	if (props.disabled || !previewFile.value) return;
	emit('capture', previewFile.value);
}
</script>

<style scoped>
/* Keyframe animations — cannot be expressed as inline Tailwind utility classes */
@keyframes ring-pulse {
	0%,
	100% {
		box-shadow: 0 0 0 0 rgb(163 230 53 / 0.3);
	}
	50% {
		box-shadow: 0 0 0 14px rgb(163 230 53 / 0);
	}
}
@keyframes blink {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0;
	}
}

.animate-ring-pulse {
	animation: ring-pulse 2s ease-in-out infinite;
}
</style>
