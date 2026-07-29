import { createAnimation } from '@ionic/vue';

/**
 * True when motion should be suppressed, from either the in-app setting or the OS.
 *
 * The OS query has to be read here rather than left to the css killswitch: ionic drives page
 * transitions through the web animations api, which never reads `animation-duration`.
 */
function prefersStill(): boolean {
	if (!import.meta.client) return false;
	if (document.documentElement.classList.contains('animations-disabled')) return true;
	return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export default (_: HTMLElement, opts?: any) => {
	if (prefersStill()) {
		return createAnimation()
			.addElement(opts?.enteringEl)
			.addElement(opts?.leavingEl)
			.beforeRemoveClass('ion-page-invisible')
			.duration(0);
	}

	const enteringEl = opts?.enteringEl;
	const leavingEl = opts?.leavingEl;
	const direction = opts?.direction ?? 'forward';

	const isBack = direction === 'back';

	const enteringFrom = isBack ? '-100%' : '100%';
	const leavingTo = isBack ? '100%' : '-100%';

	const duration =
		typeof opts?.duration === 'number' && Number.isFinite(opts.duration)
			? Math.max(0, opts.duration)
			: 520;

	const enteringAnimation = createAnimation()
		.addElement(enteringEl)
		.beforeRemoveClass('ion-page-invisible')
		.fromTo('transform', `translateX(${enteringFrom})`, 'translateX(0)')
		.fromTo('opacity', '0.85', '1')
		.duration(duration)
		.easing('cubic-bezier(0.4, 0.0, 0.2, 1)');

	const leavingAnimation = createAnimation()
		.addElement(leavingEl)
		.fromTo('transform', 'translateX(0)', `translateX(${leavingTo})`)
		.fromTo('opacity', '1', '0')
		.duration(duration)
		.easing('cubic-bezier(0.4, 0.0, 0.2, 1)');

	return createAnimation().addAnimation([enteringAnimation, leavingAnimation]);
};
