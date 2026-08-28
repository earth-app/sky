export interface QuestListEntry {
	id?: string;
	title?: string;
	description?: string;
}

/**
 * The rows the "All Quests" list renders.
 *
 * The active quest is excluded because it already has its own card under "Current Quest"; rendering
 * it in both places made the same quest appear twice, one directly under the other.
 */
export function filterQuests<T extends QuestListEntry>(
	quests: readonly T[] | null | undefined,
	search: string = '',
	activeQuestId?: string | null
): T[] {
	if (!quests?.length) return [];

	const term = search.trim().toLowerCase();

	return quests.filter((quest) => {
		if (activeQuestId && quest.id === activeQuestId) return false;
		if (!term) return true;

		const id = quest.id?.toLowerCase() ?? '';
		const title = quest.title?.toLowerCase() ?? '';
		const description = quest.description?.toLowerCase() ?? '';
		return id.includes(term) || title.includes(term) || description.includes(term);
	});
}

/**
 * Label for the "All Quests" count.
 *
 * A bare "35 shown" against a bigger catalog reads like a bug, so the total is named whenever
 * anything is held back (a search term, or the active quest shown above).
 */
export function questCountText(shown: number, total: number): string {
	const safeShown = Math.max(0, Math.floor(shown));
	const safeTotal = Math.max(safeShown, Math.floor(Number.isFinite(total) ? total : safeShown));

	return safeShown === safeTotal ? `${safeShown} shown` : `${safeShown} of ${safeTotal} shown`;
}
