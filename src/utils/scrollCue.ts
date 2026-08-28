import { toRaw } from 'vue';

/** pill height plus breathing room, so the cue never sits on top of card text */
export const SCROLL_CUE_CLEARANCE = '4.5rem';

export interface PaddableElement {
	style: { paddingBottom: string };
}

/**
 * Reserve room at the bottom of a scroll container for a fixed-position cue.
 *
 * The cue is `position: fixed`, so without this the last card scrolls underneath it and loses a
 * couple of lines mid-sentence. Returns the restore function; calling it twice is a no-op.
 *
 * The element is unwrapped with `toRaw` first: callers hold IonContent's scroll element in a `ref`,
 * which hands back a reactive proxy, and writing style through that proxy thrashes ionic's layout
 * badly enough to leave the page blank.
 */
export function reserveScrollClearance(
	element: PaddableElement | null | undefined,
	clearance: string = SCROLL_CUE_CLEARANCE
): () => void {
	const target = element ? toRaw(element) : null;
	if (!target) return () => {};

	const previous = target.style.paddingBottom;
	target.style.paddingBottom = `calc(${previous || '0px'} + ${clearance})`;

	let restored = false;
	return () => {
		if (restored) return;
		restored = true;
		target.style.paddingBottom = previous;
	};
}
