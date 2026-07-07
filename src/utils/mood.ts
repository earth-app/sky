export function moodTodayUtc(date: Date = new Date()): string {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(date.getUTCDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

// sky-only key remembering which emoji this device picked; crust's guard only stores a
// timestamp so it can't tell us which bar to highlight after a reload
export function moodMyVoteStorageKey(topic: string, date: string): string {
	return `mood_myvote:${topic.trim().toLowerCase()}:${date}`;
}

// aggregate counts -> whole-percent per emoji; 0 for every emoji when nobody has voted yet
export function computeMoodPercentages<E extends string>(
	counts: Partial<Record<E, number>> | undefined,
	total: number,
	emojis: readonly E[]
): Record<E, number> {
	const out = {} as Record<E, number>;
	for (const e of emojis) {
		const v = counts?.[e] ?? 0;
		out[e] = total > 0 ? Math.round((v / total) * 100) : 0;
	}
	return out;
}
