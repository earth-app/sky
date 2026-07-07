import type { Event } from 'types/event';
import type { User } from 'types/user';

/** event is over once its end (or start, when no end) is in the past */
export function isEventPast(
	event: Pick<Event, 'timing' | 'end_date' | 'date'>,
	now: number = Date.now()
): boolean {
	if (event.timing?.has_passed) return true;
	const end = event.end_date ?? event.date;
	return typeof end === 'number' && end > 0 && end < now;
}

export function distinctAttendees(
	host: User | null | undefined,
	list: User[] | null | undefined
): User[] | null {
	if (!list) return null;

	const seen = new Set<string>();
	const result: User[] = [];

	if (host?.id) {
		seen.add(host.id);
		result.push(host);
	}

	for (const attendee of list) {
		if (!attendee?.id || seen.has(attendee.id)) continue;
		seen.add(attendee.id);
		result.push(attendee);
	}

	return result;
}

/**
 * attendee count that can never drift from the rendered cards; prefers the deduped
 * list length and falls back to the server count until the list has loaded.
 */
export function attendeeCount(
	host: User | null | undefined,
	list: User[] | null | undefined,
	fallback = 0
): number {
	const distinct = distinctAttendees(host, list);
	return distinct ? distinct.length : fallback;
}
