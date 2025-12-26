import { createAnimation } from '@ionic/vue';

export default (_: HTMLElement, opts?: any) => {
	const enteringEl = opts?.enteringEl;
	const leavingEl = opts?.leavingEl;
	const direction = opts?.direction ?? 'forward';

	const isBack = direction === 'back';

	const enteringFrom = isBack ? '-100%' : '100%';
	const leavingTo = isBack ? '30%' : '-30%';

	const duration = 420;

	const enteringAnimation = createAnimation()
		.addElement(enteringEl)
		.beforeRemoveClass('ion-page-invisible')
		.fromTo('transform', `translateX(${enteringFrom})`, 'translateX(0)')
		.fromTo('opacity', '0.85', '1')
		.duration(duration)
		.easing('cubic-bezier(0.4, 0.0, 0.2, 1)');

	const leavingAnimation = createAnimation()
		.addElement(leavingEl)
		.fromTo('transform', 'translateX(0) scale(1)', `translateX(${leavingTo}) scale(0.98)`)
		.fromTo('opacity', '1', '0.9')
		.duration(duration)
		.easing('cubic-bezier(0.4, 0.0, 0.2, 1)');

	return createAnimation().addAnimation([enteringAnimation, leavingAnimation]);
};
