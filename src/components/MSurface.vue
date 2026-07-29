<template>
	<component
		:is="to ? NuxtLink : tag"
		class="m-card"
		:class="rootClass()"
		:to="to || undefined"
		:data-tone="tone === 'ghost' ? 'ghost' : undefined"
		:data-elev="elevation ? String(elevation) : undefined"
		:data-interactive="isInteractive ? '' : undefined"
		:role="needsButtonSemantics() ? 'button' : undefined"
		:tabindex="needsButtonSemantics() ? 0 : undefined"
		@keydown.enter="onActivateKey"
		@keydown.space="onActivateKey"
	>
		<slot />
	</component>
</template>

<script setup lang="ts">
// imported, not resolved by name: nuxt only rewrites resolveComponent(), so a string in
// :is would render a literal <nuxtlink> element at runtime
import { NuxtLink } from '#components';

const props = withDefaults(
	defineProps<{
		tone?: 'default' | 'ghost';
		elevation?: 0 | 1 | 2;
		interactive?: boolean;
		to?: string;
		tag?: string;
	}>(),
	{ tone: 'default', elevation: 0, interactive: false, tag: 'div' }
);

const attrs = useAttrs();

const isInteractive = computed(() => props.interactive || Boolean(props.to));

// read per render, never cached in a computed: useAttrs() only tracks in dev builds
function needsButtonSemantics() {
	// a link already is one; only a click-handled surface borrows button semantics, and a
	// consumer's own role/tabindex wins because they own the keyboard handling too
	return (
		Boolean(attrs.onClick) &&
		!props.to &&
		attrs.role === undefined &&
		attrs.tabindex === undefined &&
		attrs.tabIndex === undefined
	);
}

function rootClass() {
	return [
		isInteractive.value ? 'min-h-11' : '',
		props.to || needsButtonSemantics() ? 'cursor-pointer' : '',
		// ionic's unlayered core.css colours bare anchors, so the link reset needs !
		props.to ? 'text-inherit! no-underline!' : ''
	];
}

function onActivateKey(event: KeyboardEvent) {
	if (!needsButtonSemantics()) return;
	event.preventDefault();
	(event.currentTarget as HTMLElement | null)?.click();
}
</script>
