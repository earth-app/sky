/**
 * Capacitor's `PermissionState`, plus the loose strings some plugins return.
 *
 * @since 0.6.1
 */
export type PermissionLike = string | undefined | null;

/**
 * Whether asking again would actually show the OS dialog.
 *
 * Only `prompt` and `prompt-with-rationale` mean "the user has not decided yet". Re-requesting a
 * `denied` permission re-shows the dialog on both platforms, which is why a refusal used to bounce
 * straight back at the user; call {@link isPermanentlyDenied} and route them to Settings instead.
 *
 * @since 0.6.1
 */
export function canPrompt(state: PermissionLike): boolean {
	return state === 'prompt' || state === 'prompt-with-rationale';
}

/**
 * Whether the user has refused and only Settings can change it.
 *
 * @since 0.6.1
 */
export function isPermanentlyDenied(state: PermissionLike): boolean {
	return state === 'denied';
}

/**
 * Whether any of the given states is granted; plugins split one permission across several keys
 * (geolocation reports `location` and `coarseLocation` separately, and coarse is enough for us).
 *
 * @since 0.6.1
 */
export function anyGranted(...states: PermissionLike[]): boolean {
	return states.some((state) => state === 'granted');
}

/**
 * Whether asking is worth it: nothing is granted yet, but at least one key can still prompt.
 *
 * Returns false when every key is denied, which is the case that must NOT re-prompt.
 *
 * @since 0.6.1
 */
export function shouldRequest(...states: PermissionLike[]): boolean {
	if (anyGranted(...states)) return false;
	return states.some((state) => canPrompt(state));
}
