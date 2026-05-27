<template>
	<div
		class="relative min-h-96 min-w-1/4 aspect-3/4 overflow-hidden bg-neutral-950 border-8 border-neutral-900/40 rounded-2xl! p-8! max-h-[80vh]"
	>
		<div
			v-if="stage === 'intro'"
			class="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8 text-center"
		>
			<div
				class="w-20 h-20 rounded-full border-2 border-lime-400 flex items-center justify-center animate-ring-pulse"
			>
				<UIcon
					name="mdi:barcode-scan"
					class="text-3xl text-lime-400"
				/>
			</div>
			<p class="text-[0.8rem]! font-semibold! tracking-[0.12em] uppercase text-neutral-100!">
				Scan {{ kindLabel }} Barcode
			</p>
			<p class="text-[0.72rem] text-neutral-500 leading-[1.65]">
				Find a UPC or EAN barcode on the product packaging.<br />
				Only retail barcodes (UPC-A, UPC-E, EAN-8, EAN-13) are accepted.
			</p>
			<p
				v-if="keywordHint"
				class="text-[0.7rem] text-lime-300/80 italic"
			>
				The resolved title must contain "{{ keywordHint }}".
			</p>
			<button
				class="mt-1! px-6! py-2.5! rounded-xl! bg-neutral-800! text-white text-sm! font-medium! tracking-wide"
				:disabled="props.disabled"
				:class="props.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'"
				@click="startScan"
			>
				Open Scanner
			</button>
		</div>

		<div
			v-else-if="stage === 'scanning'"
			class="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8 text-center"
		>
			<div
				class="w-20 h-20 rounded-full border-2 border-lime-400 flex items-center justify-center animate-ring-pulse"
			>
				<UIcon
					name="mdi:barcode-scan"
					class="text-3xl text-lime-400"
				/>
			</div>
			<p class="text-[0.8rem]! font-semibold! tracking-[0.12em] uppercase text-neutral-100!">
				Opening Scanner
			</p>
			<p class="text-[0.72rem] text-neutral-500 leading-[1.65]">
				The native scanner should open now.<br />Hold the barcode steady within the viewfinder.
			</p>
			<button
				class="mt-1! px-6! py-2.5! rounded-xl! bg-neutral-800! text-white text-sm! font-medium! tracking-wide"
				@click="startScan"
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
					name="mdi:barcode-off"
					class="text-3xl text-red-400"
				/>
			</div>
			<p class="text-[0.8rem]! font-medium! tracking-[0.12em] uppercase text-red-400!">
				Scan Unavailable
			</p>
			<p class="text-[0.72rem]! text-neutral-500! leading-[1.65]!">{{ errorMsg }}</p>
			<button
				class="mt-2! px-6! py-2! rounded-xl! border border-neutral-700 text-white text-sm!"
				@click="startScan"
			>
				Try Again
			</button>
		</div>

		<div
			v-else-if="stage === 'preview'"
			class="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8 text-center"
		>
			<div class="w-20 h-20 rounded-full border-2 border-lime-400 flex items-center justify-center">
				<UIcon
					name="mdi:barcode"
					class="text-3xl text-lime-400"
				/>
			</div>
			<p class="text-[0.8rem]! font-semibold! tracking-[0.12em] uppercase text-neutral-100!">
				Barcode Captured
			</p>
			<div class="flex flex-col items-center gap-1">
				<p class="text-base! font-mono! text-white! tracking-widest break-all">
					{{ scannedValue }}
				</p>
				<p class="text-[0.65rem] tracking-[0.14em] uppercase text-neutral-500">
					Format: {{ scannedFormatLabel }}
				</p>
			</div>

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
					aria-label="Rescan"
					@click="rejectScan"
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
					aria-label="Submit scan"
					@click="acceptScan"
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
import {
	CapacitorBarcodeScanner,
	CapacitorBarcodeScannerTypeHint
} from '@capacitor/barcode-scanner';
import { Toast } from '@capacitor/toast';

const props = defineProps<{
	disabled?: boolean;
	kind?: 'food' | 'music' | 'book';
	keyword?: string;
}>();

const emit = defineEmits<{
	capture: [payload: { data: string; format: number }];
	'scan-taken': [];
	'scan-rejected': [];
}>();

const { require: requirePermission } = useQuestPermissions();

type BarcodeStage = 'intro' | 'scanning' | 'preview' | 'error';

const stage = ref<BarcodeStage>('intro');
const errorMsg = ref('');
const scannedValue = ref('');
const scannedFormat = ref<number>(-1);

const kindLabel = computed(() => {
	switch (props.kind) {
		case 'food':
			return 'Food';
		case 'music':
			return 'Music';
		case 'book':
			return 'Book';
		default:
			return 'Product';
	}
});

const keywordHint = computed(() => props.keyword?.trim() || '');

// Numeric format codes match Html5QrcodeSupportedFormats. Only the linear retail
// formats below are accepted by the cloud validator; anything else (QR, Code-128,
// etc.) is rejected server-side, so we surface a friendly error before submitting.
const RETAIL_FORMATS: Record<number, string> = {
	9: 'EAN-13',
	10: 'EAN-8',
	14: 'UPC-A',
	15: 'UPC-E'
};

const scannedFormatLabel = computed(() => {
	const f = scannedFormat.value;
	return RETAIL_FORMATS[f] ?? `Format ${f}`;
});

async function startScan() {
	if (props.disabled) {
		await Toast.show({
			text: 'This step is currently unavailable.',
			duration: 'short',
			position: 'bottom'
		});
		return;
	}

	const cameraOk = await requirePermission('camera');
	if (!cameraOk) {
		stage.value = 'error';
		errorMsg.value =
			'Camera access is required to complete this quest step. Please allow it in your device settings.';
		return;
	}

	stage.value = 'scanning';
	try {
		const result = await CapacitorBarcodeScanner.scanBarcode({
			hint: CapacitorBarcodeScannerTypeHint.ALL,
			scanInstructions: 'Center the barcode within the frame'
		});

		const value = (result.ScanResult ?? '').trim();
		const format = Number(result.format);

		if (!value) {
			stage.value = 'error';
			errorMsg.value = 'No barcode was detected. Please try again.';
			return;
		}

		if (!Number.isFinite(format) || !(format in RETAIL_FORMATS)) {
			stage.value = 'error';
			errorMsg.value = 'That barcode format is not supported. Use a UPC or EAN retail barcode.';
			return;
		}

		scannedValue.value = value;
		scannedFormat.value = format;
		stage.value = 'preview';
		emit('scan-taken');
	} catch (e: unknown) {
		if (isCancelError(e)) {
			stage.value = 'intro';
			return;
		}
		stage.value = 'error';
		errorMsg.value =
			'Unable to access the barcode scanner. Make sure camera permissions are granted.';
	}
}

function isCancelError(err: unknown): boolean {
	if (!err) return false;
	const message = String((err as { message?: string }).message || err);
	return /cancel|canceled|cancelled|user dismissed/i.test(message);
}

function rejectScan() {
	scannedValue.value = '';
	scannedFormat.value = -1;
	emit('scan-rejected');
	void startScan();
}

function acceptScan() {
	if (props.disabled || !scannedValue.value || scannedFormat.value < 0) return;
	emit('capture', { data: scannedValue.value, format: scannedFormat.value });
}
</script>

<style scoped>
@keyframes ring-pulse {
	0%,
	100% {
		box-shadow: 0 0 0 0 rgb(163 230 53 / 0.3);
	}
	50% {
		box-shadow: 0 0 0 14px rgb(163 230 53 / 0);
	}
}

.animate-ring-pulse {
	animation: ring-pulse 2s ease-in-out infinite;
}
</style>
