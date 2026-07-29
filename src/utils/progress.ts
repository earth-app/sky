/** svg geometry for one circular progress ring, in user units matching its pixel size */
export interface RingGeometry {
	size: number;
	center: number;
	radius: number;
	strokeWidth: number;
	circumference: number;
	dashOffset: number;
	fraction: number;
	/** px font size for the centre value, scaled off the ring */
	valueSize: number;
	/** px font size for the caption under the centre value */
	labelSize: number;
}

export const DEFAULT_RING_SIZE = 96;

/** clamps any input, including NaN, into the 0..1 progress domain */
export function clampFraction(value: number): number {
	if (!Number.isFinite(value)) return 0;
	if (value <= 0) return 0;
	if (value >= 1) return 1;
	return value;
}

export function progressPercent(value: number): number {
	const fraction = clampFraction(value);
	if (fraction >= 1) return 100;
	// never round up to a complete-looking 100 while work remains
	return Math.min(99, Math.round(fraction * 100));
}

export function progressDone(value: number, total: number): number {
	const steps = Number.isFinite(total) ? Math.round(total) : 0;
	if (steps <= 0) return 0;

	const fraction = clampFraction(value);
	if (fraction >= 1) return steps;
	return Math.min(steps - 1, Math.round(fraction * steps));
}

export function progressLabel(value: number, total?: number | null): string {
	const steps = typeof total === 'number' && Number.isFinite(total) ? Math.round(total) : 0;
	if (steps > 0) return `${progressDone(value, steps)} of ${steps} complete`;
	return `${progressPercent(value)}% complete`;
}

export function ringGeometry(
	value: number,
	size: number = DEFAULT_RING_SIZE,
	strokeWidth?: number
): RingGeometry {
	const box = Number.isFinite(size) && size > 0 ? size : DEFAULT_RING_SIZE;
	const requested =
		typeof strokeWidth === 'number' && Number.isFinite(strokeWidth) && strokeWidth > 0
			? strokeWidth
			: box / 12;
	// capped at a quarter of the box so the radius can never collapse to zero
	const stroke = Math.min(Math.max(requested, 1), box / 4);
	const center = box / 2;
	// half the stroke sits outside the radius, so inset by half to keep the arc inside the box
	const radius = center - stroke / 2;
	const circumference = 2 * Math.PI * radius;
	const fraction = clampFraction(value);

	return {
		size: box,
		center,
		radius,
		strokeWidth: stroke,
		circumference,
		dashOffset: circumference * (1 - fraction),
		fraction,
		valueSize: Math.round(box * 0.32),
		labelSize: Math.max(9, Math.round(box * 0.13))
	};
}
