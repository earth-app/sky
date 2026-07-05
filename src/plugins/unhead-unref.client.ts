import { defineNuxtPlugin, injectHead } from '#imports';
import { isRef, toValue } from 'vue';

export default defineNuxtPlugin({
	name: 'sky:unhead-unref',
	enforce: 'post',
	setup(nuxtApp) {
		if (!import.meta.client) return;

		// unref head values so @nuxt/ui's computed theme <style> isn't JSON.stringify'd (cyclic) on ssr:false
		const head = nuxtApp.vueApp.runWithContext(() => injectHead()) as any;
		const opts = head?.resolvedOptions;
		if (!opts) return;

		const unref = (_key: string | undefined, value: unknown) =>
			isRef(value) ? toValue(value) : value;

		opts.propResolvers = [...(opts.propResolvers ?? []), unref];
	}
});
