export type JourneyTapResult =
	| {
			success: boolean;
			data?: { count?: number; incremented?: boolean } | null;
			message?: string;
	  }
	| null
	| undefined;

export function shouldShowJourneyToast(
	res: JourneyTapResult
): res is { success: true; data: { count: number; incremented: true } } {
	if (!res || res.success !== true || !res.data) return false;
	if (res.data.incremented !== true) return false;
	return typeof res.data.count === 'number' && Number.isFinite(res.data.count);
}
