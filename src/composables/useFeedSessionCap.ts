import { Preferences } from '@capacitor/preferences';

// soft finite-session ceilings; a calm "all caught up" cue fires past these instead
// of endless scroll (Fitz 2019 finite sessions; Clark & Zack 2023). both tunable
export const DEFAULT_SESSION_CAP = 18;
export const DEFAULT_DAILY_CAP = 60;
const DAILY_KEY = 'sky:feed-session-cap:daily';

// local yyyy-mm-dd; the boundary the daily ceiling resets on
export function feedDayKey(d: Date = new Date()): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

interface DailyRecord {
	day: string;
	count: number;
}

// tolerant parse; any malformed / stale payload collapses to a fresh record for today
export function parseDailyRecord(raw: string | null | undefined): DailyRecord {
	if (!raw) return { day: feedDayKey(), count: 0 };
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (
			parsed &&
			typeof parsed === 'object' &&
			typeof (parsed as DailyRecord).day === 'string' &&
			Number.isFinite((parsed as DailyRecord).count)
		) {
			const rec = parsed as DailyRecord;
			return { day: rec.day, count: Math.max(0, Math.floor(rec.count)) };
		}
	} catch {
		// fall through to a fresh record
	}
	return { day: feedDayKey(), count: 0 };
}

export function useFeedSessionCap(opts: { sessionCap?: number; dailyCap?: number } = {}) {
	const sessionCap = Math.max(1, Math.floor(opts.sessionCap ?? DEFAULT_SESSION_CAP));
	const dailyCap = Math.max(1, Math.floor(opts.dailyCap ?? DEFAULT_DAILY_CAP));

	// sessionCount is in-memory (resets each run); dailyCount is persisted + day-scoped
	const sessionCount = ref(0);
	const dailyCount = ref(0);
	const loaded = ref(false);
	// soft-cap escape hatch; once the user chooses to keep browsing we stop nagging this session
	const overridden = ref(false);

	const capReached = computed(
		() =>
			loaded.value &&
			!overridden.value &&
			(sessionCount.value >= sessionCap || dailyCount.value >= dailyCap)
	);

	// which ceiling is binding (daily wins for messaging since it's the wider signal)
	const capReason = computed<'session' | 'daily' | null>(() => {
		if (!capReached.value) return null;
		if (dailyCount.value >= dailyCap) return 'daily';
		return 'session';
	});

	async function persist(count: number): Promise<void> {
		try {
			await Preferences.set({
				key: DAILY_KEY,
				value: JSON.stringify({ day: feedDayKey(), count } satisfies DailyRecord)
			});
		} catch {
			// best-effort; a missed write just under-counts the daily ceiling
		}
	}

	// hydrate the daily ceiling for today; a stale day resets it to zero
	async function load(): Promise<void> {
		try {
			const { value } = await Preferences.get({ key: DAILY_KEY });
			const rec = parseDailyRecord(value);
			if (rec.day !== feedDayKey()) {
				dailyCount.value = 0;
				await persist(0);
			} else {
				dailyCount.value = rec.count;
			}
		} catch {
			dailyCount.value = 0;
		} finally {
			loaded.value = true;
		}
	}

	// record newly shown feed items toward both the session run + the daily ceiling
	async function note(itemsShown: number): Promise<void> {
		const n = Number.isFinite(itemsShown) ? Math.max(0, Math.floor(itemsShown)) : 0;
		if (n === 0) return;
		sessionCount.value += n;
		dailyCount.value += n;
		await persist(dailyCount.value);
	}

	// pull-to-refresh: explicit intent to start a fresh run, so clear the session + override
	function resetSession(): void {
		sessionCount.value = 0;
		overridden.value = false;
	}

	// user tapped "keep browsing" on the caught-up card; suppress the cap for the rest of this session
	function keepBrowsing(): void {
		overridden.value = true;
	}

	return {
		sessionCap,
		dailyCap,
		sessionCount,
		dailyCount,
		loaded,
		capReached,
		capReason,
		load,
		note,
		resetSession,
		keepBrowsing
	};
}
