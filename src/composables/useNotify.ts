import { Toast } from '@capacitor/toast';
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

export async function showErrorToast(
	error: unknown,
	options: { fallback?: string; duration?: ToastDuration } = {}
) {
	const { fallback, duration = 'long' } = options;
	const text = formatApiError(error, fallback);

	// surface in logs before the toast; toast plugin can fail on web
	logWarn('toast.error', text);

	try {
		await Toast.show({ text, duration });
	} catch {
		// toast plugin can fail on web in some environments; swallow
	}

	return text;
}

export async function showInfoToast(text: string, options: { duration?: ToastDuration } = {}) {
	if (!text) return;
	logInfo('toast.info', text);
	try {
		await Toast.show({ text, duration: options.duration ?? 'short' });
	} catch {
		// swallow toast errors
	}
}

// matches the crust extractor name so shared callers can use the same symbol
// from either side; rich status fallbacks are sky-specific
export const extractServerMessage = formatApiError;
