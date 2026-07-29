import { logInfo, logWarn } from './useLogger';

type FetchLikeError = {
	statusCode?: number;
	status?: number;
	statusMessage?: string;
	statusText?: string;
	message?: string;
	data?: { message?: string; error?: string } | string;
	response?: { status?: number; statusText?: string };
};

const STATUS_FALLBACKS: Record<number, string> = {
	400: 'The request was invalid. Please check your inputs and try again.',
	401: 'You need to sign in to continue.',
	403: 'You do not have permission to perform this action.',
	404: 'We could not find what you were looking for.',
	408: 'The request timed out. Please try again.',
	409: 'That conflicts with an existing record.',
	410: 'That resource is no longer available.',
	413: 'The file or payload is too large.',
	415: 'That file type is not supported.',
	422: 'Some of the data was rejected. Please review and try again.',
	429: 'You are doing that too often. Please slow down and try again.',
	500: 'Something went wrong on our end. Please try again shortly.',
	502: 'The server is temporarily unavailable. Please try again.',
	503: 'The service is temporarily unavailable. Please try again.',
	504: 'The server took too long to respond. Please try again.'
};

const URL_PATH_PATTERN = /\[\d+\]\s*\/?[a-zA-Z0-9_\-/.?=&%:]+/g;
const RAW_BRACKET_STATUS_PATTERN = /^\[\d+\][\s\S]*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractStatus(error: FetchLikeError | undefined | null): number | null {
	if (!error) return null;

	const candidates = [
		error.statusCode,
		error.status,
		error.response?.status,
		typeof error.message === 'string' ? Number(error.message.match(/\b(\d{3})\b/)?.[1]) : NaN
	];

	for (const candidate of candidates) {
		const numeric = Number(candidate);
		if (Number.isFinite(numeric) && numeric >= 100 && numeric < 600) {
			return numeric;
		}
	}

	return null;
}

function extractServerMessageRaw(error: FetchLikeError | undefined | null): string | null {
	if (!error) return null;

	if (typeof error.data === 'string' && error.data.trim()) {
		return error.data.trim();
	}

	if (isPlainObject(error.data)) {
		const message = (error.data as Record<string, unknown>).message;
		if (typeof message === 'string' && message.trim()) return message.trim();

		const altError = (error.data as Record<string, unknown>).error;
		if (typeof altError === 'string' && altError.trim()) return altError.trim();
	}

	if (error.statusMessage && typeof error.statusMessage === 'string') {
		return error.statusMessage.trim();
	}

	return null;
}

export function looksLikeRawHttpError(value: string): boolean {
	if (!value) return false;
	const trimmed = value.trim();
	return RAW_BRACKET_STATUS_PATTERN.test(trimmed) || trimmed.includes('/api/');
}

function sanitizeMessage(value: string): string {
	return value
		.replace(URL_PATH_PATTERN, '')
		.replace(/\s{2,}/g, ' ')
		.replace(/^[\s:.,-]+|[\s:.,-]+$/g, '')
		.trim();
}

export function formatApiError(
	error: unknown,
	fallback = 'Something went wrong. Please try again.'
): string {
	if (!error) return fallback;

	if (typeof error === 'string') {
		if (looksLikeRawHttpError(error)) {
			const status = Number(error.match(/\[(\d{3})\]/)?.[1]);
			if (Number.isFinite(status) && STATUS_FALLBACKS[status]) {
				return STATUS_FALLBACKS[status];
			}
			const cleaned = sanitizeMessage(error);
			return cleaned || fallback;
		}
		return error;
	}

	const fetchError = error as FetchLikeError;
	const status = extractStatus(fetchError);
	const serverMessage = extractServerMessageRaw(fetchError);

	if (serverMessage && !looksLikeRawHttpError(serverMessage)) {
		return serverMessage;
	}

	if (status && STATUS_FALLBACKS[status]) {
		return STATUS_FALLBACKS[status];
	}

	const rawMessage = typeof fetchError.message === 'string' ? fetchError.message : '';
	if (rawMessage && !looksLikeRawHttpError(rawMessage)) {
		return rawMessage;
	}

	const sanitized = sanitizeMessage(rawMessage);
	if (sanitized && !looksLikeRawHttpError(sanitized)) {
		return sanitized;
	}

	return fallback;
}

type ToastDuration = 'short' | 'long';

// #region in-app toast surface

export type ToastSeverity = 'info' | 'success' | 'warning' | 'error';

/** A single inline control on a toast. Label is Title Case, like every other button. */
export type ToastAction = {
	label: string;
	handler: () => unknown;
};

export type ToastOptions = {
	duration?: ToastDuration;
	/** overrides the severity eyebrow (e.g. 'Draft Saved') */
	title?: string;
	action?: ToastAction;
};

export type MToastItem = {
	id: number;
	severity: ToastSeverity;
	text: string;
	title?: string;
	action?: ToastAction;
	dwellMs: number;
	createdAt: number;
};

/** how many toasts MToast paints at once; the rest wait their turn */
export const MAX_VISIBLE_TOASTS = 2;
const MAX_QUEUED_TOASTS = 5;
const DWELL_MS: Record<ToastDuration, number> = { short: 3200, long: 5000 };

/** the live queue MToast renders; oldest first */
export const mToasts = ref<MToastItem[]>([]);

const mToastHosts = ref(0);
/** false until an MToast host is mounted, which routes toasts to the native OS toast */
export const mToastHostReady = computed(() => mToastHosts.value > 0);

let nextToastId = 1;

function defaultDurationFor(severity: ToastSeverity): ToastDuration {
	return severity === 'error' || severity === 'warning' ? 'long' : 'short';
}

/**
 * Register the mounted in-app toast host and return its teardown. Releasing the last
 * host drops the queue, because nothing is left to paint it.
 */
export function registerMToastHost(): () => void {
	mToastHosts.value++;

	let released = false;
	return () => {
		if (released) return;
		released = true;
		mToastHosts.value = Math.max(0, mToastHosts.value - 1);
		if (mToastHosts.value === 0) mToasts.value = [];
	};
}

export function dismissMToast(id: number) {
	mToasts.value = mToasts.value.filter((toast) => toast.id !== id);
}

export function clearMToasts() {
	mToasts.value = [];
}

// a backgrounded webview cannot paint, so the os toast is the only surface left
function canRenderInApp(): boolean {
	if (!import.meta.client || !mToastHostReady.value) return false;
	if (typeof document === 'undefined') return true;
	return document.visibilityState !== 'hidden';
}

/**
 * Push a toast onto the in-app queue. Returns null when the in-app surface cannot
 * take it, which is the caller's signal to fall back to the native OS toast.
 */
export function enqueueMToast(
	severity: ToastSeverity,
	text: string,
	options: ToastOptions = {}
): MToastItem | null {
	if (!text || !canRenderInApp()) return null;

	// a repeat while the first copy is still queued is noise, not information
	const duplicate = mToasts.value.find(
		(toast) => toast.severity === severity && toast.text === text
	);
	if (duplicate) return duplicate;

	const toast: MToastItem = {
		id: nextToastId++,
		severity,
		text,
		title: options.title,
		action: options.action,
		dwellMs: DWELL_MS[options.duration ?? defaultDurationFor(severity)],
		createdAt: Date.now()
	};

	const next = [...mToasts.value, toast];
	// evict the oldest WAITING toast, never one the user is already reading
	while (next.length > MAX_QUEUED_TOASTS) next.splice(MAX_VISIBLE_TOASTS, 1);
	mToasts.value = next;

	if (typeof window !== 'undefined') {
		window.dispatchEvent(
			new CustomEvent('earth-app:toast', {
				detail: { id: toast.id, severity, text }
			})
		);
	}

	return toast;
}

async function showNativeToast(text: string, duration: ToastDuration) {
	try {
		const { Toast } = await import('@capacitor/toast');
		await Toast.show({ text, duration });
	} catch {
		// missing plugin, web build, or a bridge that is not up yet; never throw into a ui handler
	}
}

/**
 * Show a toast on the in-app surface, falling back to the native OS toast when no
 * host is mounted or the app is backgrounded.
 */
export async function showToast(
	severity: ToastSeverity,
	text: string,
	options: ToastOptions = {}
): Promise<void> {
	if (!text) return;

	const duration = options.duration ?? defaultDurationFor(severity);

	// log before painting; the surface can be unavailable but the record should not be
	if (severity === 'error' || severity === 'warning') logWarn(`toast.${severity}`, text);
	else logInfo(`toast.${severity}`, text);

	if (enqueueMToast(severity, text, { ...options, duration })) return;

	await showNativeToast(text, duration);
}

// #endregion

export async function showErrorToast(
	error: unknown,
	options: { fallback?: string } & ToastOptions = {}
) {
	const { fallback, ...rest } = options;
	const text = formatApiError(error, fallback);

	await showToast('error', text, rest);

	return text;
}

export async function showInfoToast(text: string, options: ToastOptions = {}) {
	await showToast('info', text, options);
}

export async function showSuccessToast(text: string, options: ToastOptions = {}) {
	await showToast('success', text, options);
}

export async function showWarningToast(text: string, options: ToastOptions = {}) {
	await showToast('warning', text, options);
}

// matches the crust extractor name so shared callers can use the same symbol
// from either side; rich status fallbacks are sky-specific
export const extractServerMessage = formatApiError;
