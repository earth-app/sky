// "120 m" under 1km, "1.4 km" above; distance itself comes from crust's trailmarkDistanceMeters
export function formatDistanceLabel(meters: number | undefined): string {
	if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) return '';
	if (meters < 1000) return `${meters} m`;
	return `${(meters / 1000).toFixed(1)} km`;
}
