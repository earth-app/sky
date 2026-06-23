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
				{{ kindInstructions }}<br />
				{{ kindFormatNote }}
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
				Continue
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
			v-else-if="stage === 'live'"
			class="absolute inset-0 flex flex-col"
		>
			<div
				:id="scannerElementId"
				class="flex-1 w-full bg-black overflow-hidden rounded-xl"
			></div>
			<p class="mt-3! text-[0.7rem]! text-neutral-400! text-center tracking-wide">
				{{ liveFrameLabel }}
			</p>
			<button
				class="mt-3! mx-auto! px-6! py-2! rounded-xl! bg-neutral-800! text-white! text-sm! font-medium! tracking-wide cursor-pointer"
				@click="cancelWebScan"
			>
				Cancel
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
			<div class="flex flex-col items-center gap-1 mb-8">
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
	CapacitorBarcodeScannerAndroidScanningLibrary,
	CapacitorBarcodeScannerTypeHint
} from '@capacitor/barcode-scanner';
import { Capacitor } from '@capacitor/core';
import { Toast } from '@capacitor/toast';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

type BarcodeKind = 'food' | 'music' | 'book' | 'beauty' | 'pet' | 'product' | 'vehicle' | 'flight';

const props = withDefaults(
	defineProps<{
		disabled?: boolean;
		kind?: BarcodeKind;
		keyword?: string;
		submit?: boolean;
	}>(),
	{ submit: true }
);

const emit = defineEmits<{
	capture: [payload: { data: string; format: number }];
	'scan-taken': [];
	'scan-rejected': [];
	submitted: [];
}>();

const { require: requirePermission, prime: primePermission } = useQuestPermissions();

// Pre-warm the camera prompt so the OS dialog appears the moment the step
// opens rather than after the user taps Continue. The require() call in
// startScan() still runs as the source of truth; this just front-loads the
// friction.
onMounted(() => {
	if (props.disabled) return;
	void primePermission('camera');
});

type BarcodeStage = 'intro' | 'scanning' | 'live' | 'preview' | 'error';

const stage = ref<BarcodeStage>('intro');
const errorMsg = ref('');
const scannedValue = ref('');
const scannedFormat = ref<number>(-1);

const isNative = Capacitor.isNativePlatform();
const scannerElementId = `mbarcode-${useId()}`;
const webScanner = shallowRef<Html5Qrcode | null>(null);

const kindLabel = computed(() => {
	switch (props.kind) {
		case 'food':
			return 'Food';
		case 'music':
			return 'Music';
		case 'book':
			return 'Book';
		case 'beauty':
			return 'Beauty';
		case 'pet':
			return 'Pet';
		case 'product':
			return 'Product';
		case 'vehicle':
			return 'Vehicle (VIN)';
		case 'flight':
			return 'Flight';
		default:
			return 'Product';
	}
});

// Retail kinds use UPC/EAN; vehicle is a VIN (17-char alphanumeric on the windshield or doorjamb);
// flight is a boarding pass (PDF417 / Aztec / QR / Data Matrix).
const kindInstructions = computed(() => {
	switch (props.kind) {
		case 'vehicle':
			return 'Scan a VIN barcode, usually on the driver-side door jamb or under the windshield. 17 alphanumeric characters.';
		case 'flight':
			return 'Scan the barcode on a boarding pass (PDF417 stripe or QR-style square).';
		case 'beauty':
		case 'pet':
		case 'product':
		case 'food':
		case 'music':
		case 'book':
		default:
			return 'Find a UPC or EAN barcode on the product packaging.';
	}
});

const liveFrameLabel = computed(() => {
	switch (props.kind) {
		case 'vehicle':
			return 'Align the VIN barcode within the frame';
		case 'flight':
			return 'Align the boarding-pass barcode within the frame';
		default:
			return 'Align a UPC or EAN barcode within the frame';
	}
});

const kindFormatNote = computed(() => {
	switch (props.kind) {
		case 'vehicle':
			return 'Vehicle scans accept CODE-39, DATA MATRIX, or PDF417 VIN labels.';
		case 'flight':
			return 'Boarding pass scans accept PDF417, AZTEC, QR, or DATA MATRIX.';
		default:
			return 'Only retail barcodes (UPC-A, UPC-E, EAN-8, EAN-13) are accepted.';
	}
});

const keywordHint = computed(() => props.keyword?.trim() || '');

const FORMAT_LABELS: Record<number, string> = {
	0: 'QR',
	1: 'AZTEC',
	3: 'CODE-39',
	6: 'DATA MATRIX',
	9: 'EAN-13',
	10: 'EAN-8',
	11: 'PDF417',
	14: 'UPC-A',
	15: 'UPC-E'
};

const RETAIL_FORMAT_CODES = [9, 10, 14, 15] as const;
const VIN_FORMAT_CODES = [3, 6, 11] as const;
const BOARDING_PASS_FORMAT_CODES = [0, 1, 6, 11] as const;

function allowedFormatsForKind(kind: BarcodeKind | undefined): Set<number> {
	switch (kind) {
		case 'vehicle':
			return new Set<number>(VIN_FORMAT_CODES);
		case 'flight':
			return new Set<number>(BOARDING_PASS_FORMAT_CODES);
		default:
			return new Set<number>(RETAIL_FORMAT_CODES);
	}
}

const allowedFormats = computed(() => allowedFormatsForKind(props.kind));

const scannedFormatLabel = computed(() => {
	const f = scannedFormat.value;
	return FORMAT_LABELS[f] ?? `Format ${f}`;
});

function unsupportedFormatMessage(kind: BarcodeKind | undefined): string {
	switch (kind) {
		case 'vehicle':
			return 'That barcode format is not a VIN label. Use the CODE-39, PDF417, or DATA MATRIX barcode on the doorjamb or windshield VIN sticker.';
		case 'flight':
			return 'That barcode format is not a boarding pass. Use the PDF417, AZTEC, QR, or DATA MATRIX code printed on the pass.';
		default:
			return 'That barcode format is not supported. Use a UPC or EAN retail barcode.';
	}
}

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

	if (!isNative) {
		await startWebScan();
		return;
	}

	stage.value = 'scanning';
	try {
		// MLKit is much faster + more reliable than ZXing for UPC/EAN auto-detect;
		// ZXing routinely fails to lock onto retail barcodes without near-perfect
		// framing. MLKit is already a transitive dependency of the plugin (see its
		// android/build.gradle), so this only flips which one runs at scan time.
		// scanButton: false is the plugin default but pin it explicitly so the
		// native UI never injects a manual capture button into the auto-detect flow.
		const result = await CapacitorBarcodeScanner.scanBarcode({
			hint: CapacitorBarcodeScannerTypeHint.ALL,
			scanInstructions: 'Center the barcode within the frame',
			scanButton: false,
			android: { scanningLibrary: CapacitorBarcodeScannerAndroidScanningLibrary.MLKIT }
		});

		const value = (result.ScanResult ?? '').trim();
		const format = Number(result.format);

		if (!value) {
			stage.value = 'error';
			errorMsg.value = 'No barcode was detected. Please try again.';
			return;
		}

		if (!Number.isFinite(format) || !allowedFormats.value.has(format)) {
			stage.value = 'error';
			errorMsg.value = unsupportedFormatMessage(props.kind);
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

// The bundled @capacitor/barcode-scanner web fallback locks ZXing to a small
// square scan region (qrbox = width * 9/16), which fails to decode UPC/EAN
// barcodes in practice. On web we drive html5-qrcode directly with a wide
// rectangular qrbox and per-kind formats so the dev/browser flow actually works
// end-to-end. Native iOS/Android keeps the plugin path above.
function html5FormatsForKind(kind: BarcodeKind | undefined): Html5QrcodeSupportedFormats[] {
	switch (kind) {
		case 'vehicle':
			return [
				Html5QrcodeSupportedFormats.CODE_39,
				Html5QrcodeSupportedFormats.DATA_MATRIX,
				Html5QrcodeSupportedFormats.PDF_417
			];
		case 'flight':
			return [
				Html5QrcodeSupportedFormats.PDF_417,
				Html5QrcodeSupportedFormats.AZTEC,
				Html5QrcodeSupportedFormats.QR_CODE,
				Html5QrcodeSupportedFormats.DATA_MATRIX
			];
		default:
			return [
				Html5QrcodeSupportedFormats.EAN_13,
				Html5QrcodeSupportedFormats.EAN_8,
				Html5QrcodeSupportedFormats.UPC_A,
				Html5QrcodeSupportedFormats.UPC_E
			];
	}
}

async function startWebScan() {
	await stopWebScan();
	stage.value = 'live';
	await nextTick();

	const scanner = new Html5Qrcode(scannerElementId, {
		formatsToSupport: html5FormatsForKind(props.kind),
		verbose: false,
		// Chrome/Edge ship a native BarcodeDetector that is dramatically more
		// reliable than the pure-JS ZXing fallback html5-qrcode uses by default,
		// especially for UPC/EAN under poor focus or laptop webcams. The library
		// falls back to ZXing automatically where it isn't supported.
		useBarCodeDetectorIfSupported: true
	});
	webScanner.value = scanner;

	// 2D codes (boarding pass, data-matrix VIN) need a roughly square viewfinder;
	// linear retail / VIN labels read best with a wide rectangle.
	const isTwoDKind = props.kind === 'flight';

	try {
		await scanner.start(
			{ facingMode: 'environment' },
			{
				// ZXing-JS misses barcodes when the camera image is blurry. Higher
				// fps gives it more frames to lock onto, and a generous qrbox keeps
				// the scan region forgiving for shaky hands and bad focus.
				fps: 24,
				qrbox: (vfWidth, vfHeight) =>
					isTwoDKind
						? {
								width: Math.max(220, Math.floor(Math.min(vfWidth, vfHeight) * 0.8)),
								height: Math.max(220, Math.floor(Math.min(vfWidth, vfHeight) * 0.8))
							}
						: {
								width: Math.max(220, Math.floor(vfWidth * 0.92)),
								height: Math.max(140, Math.floor(vfHeight * 0.55))
							}
			},
			(decodedText, decodedResult) => {
				const trimmed = decodedText.trim();
				if (!trimmed) return;
				const formatNum = decodedResult.result?.format?.format;
				// Web scanners report format ordinals inconsistently across
				// engines (ZXing-JS vs native BarcodeDetector vs Safari fallback).
				// Accept any non-empty decoded value here and let the backend's
				// format validation produce the friendly per-kind error. Better
				// to surface the scan than to silently drop a valid barcode
				// because we couldn't read its format metadata.
				scannedValue.value = trimmed;
				scannedFormat.value = typeof formatNum === 'number' ? formatNum : -1;
				stage.value = 'preview';
				emit('scan-taken');
				void stopWebScan();
			},
			() => {
				// per-frame "no code" errors are expected; swallow them
			}
		);
	} catch (e) {
		await stopWebScan();
		if (isCancelError(e)) {
			stage.value = 'intro';
			return;
		}
		stage.value = 'error';
		errorMsg.value =
			'Unable to access the camera. Make sure camera permissions are granted and try again.';
	}
}

async function stopWebScan() {
	const scanner = webScanner.value;
	webScanner.value = null;
	if (!scanner) return;
	try {
		if (scanner.isScanning) await scanner.stop();
		scanner.clear();
	} catch {
		// scanner may already be stopped; safe to ignore
	}
}

async function cancelWebScan() {
	await stopWebScan();
	scannedValue.value = '';
	scannedFormat.value = -1;
	stage.value = 'intro';
	emit('scan-rejected');
}

onUnmounted(() => {
	void stopWebScan();
});

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
	if (props.disabled || !scannedValue.value) return;
	if (props.submit === false) {
		emit('submitted');
		return;
	}
	// Format ordinal can be -1 when the web scanner decoded a value but didn't
	// expose a recognized format code (engine differences across browsers).
	// Send what we have; backend validates and surfaces the friendly error.
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
