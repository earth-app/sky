export type ActivitySelectorItem = {
	label: string;
	value: string;
	icon: string;
	isActivityType?: boolean;
};

export function filterActivityItems<T extends ActivitySelectorItem>(
	items: T[],
	query: string,
	serverMatches: Set<string> | null
): T[] {
	const q = query.trim().toLowerCase();
	if (!q) return items;

	return items.filter((item) => {
		if (item.isActivityType) return item.label.toLowerCase().includes(q);
		if (serverMatches?.has(item.value)) return true;
		return item.label.toLowerCase().includes(q);
	});
}
