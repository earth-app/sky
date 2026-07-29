import { sceneToSvg } from '~/utils/scene';
import { buildScene, sceneShapes, SETTLED_MOTION, type TimeOfDay } from '~/utils/scene-earth';

export const AMBIENT_EXPORT_WIDTH = 1080;
export const AMBIENT_EXPORT_HEIGHT = 1080;

export interface AmbientExportOptions {
	width?: number;
	height?: number;
	/** an SVG <title> for assistive tech; a generated one describes the hour */
	title?: string;
	/** corner radius on the frame clip */
	radius?: number;
	/** the clock the palette is taken from; pass one to make an export reproducible */
	now?: Date;
}

const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
	dawn: 'Dawn',
	day: 'Daylight',
	dusk: 'Dusk',
	night: 'Night'
};

/**
 * The settled frame as real vector markup.
 *
 * Genuinely vector, not a bitmap in an `<image>` wrapper: `sceneToSvg` serialises the same shape IR
 * the canvas paints, so a share card scales to any size and cannot drift from what was on screen.
 * Nothing here touches the DOM or the render path - no canvas, no measurement, no frame cost.
 */
export function useAmbientExport() {
	function ambientSvg(seed: string, options: AmbientExportOptions = {}): string {
		const width = Math.max(1, Math.round(options.width ?? AMBIENT_EXPORT_WIDTH));
		const height = Math.max(1, Math.round(options.height ?? AMBIENT_EXPORT_HEIGHT));
		const scene = buildScene(seed, options.now ?? new Date());
		const shapes = sceneShapes(scene, { width, height }, SETTLED_MOTION);

		return sceneToSvg(shapes, {
			width,
			height,
			radius: options.radius,
			title: options.title ?? `Ambient Scene at ${TIME_OF_DAY_LABELS[scene.timeOfDay]}`
		});
	}

	/** inline-able source for an <img>, so a share sheet can hand it straight to a preview */
	function ambientSvgDataUrl(seed: string, options: AmbientExportOptions = {}): string {
		return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ambientSvg(seed, options))}`;
	}

	return { ambientSvg, ambientSvgDataUrl };
}
