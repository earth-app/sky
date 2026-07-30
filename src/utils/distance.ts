/** 20 mph. above this the movement is vehicular, not a walk, run or ride */
export const MAX_SPEED_MPS = 8.9408;

export function plausibleCeilingMeters(
	elapsedMs: number,
	baseMeters = 0,
	maxSpeedMps = MAX_SPEED_MPS
): number {
	if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return Math.max(0, baseMeters);
	return Math.max(0, baseMeters) + (elapsedMs / 1000) * maxSpeedMps;
}

export function acceptSyncedDistance(input: {
	candidateMeters: number;
	currentMeters: number;
	baseMeters: number;
	elapsedMs: number;
	maxSpeedMps?: number;
}): number {
	const { candidateMeters, currentMeters, baseMeters, elapsedMs, maxSpeedMps } = input;
	if (!Number.isFinite(candidateMeters) || candidateMeters <= currentMeters) return currentMeters;
	const ceiling = plausibleCeilingMeters(elapsedMs, baseMeters, maxSpeedMps);
	return Math.max(currentMeters, Math.min(candidateMeters, ceiling));
}
