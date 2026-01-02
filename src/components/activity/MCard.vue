<template>
	<MInfoCard
		:title="activity.name"
		:badges="
			activity.types.map((type, i) => ({
				text: capitalizeFully(type.replace(/_/g, ' ')),
				color: colors[Math.min(colors.length - 1, i)] as any
			}))
		"
		:icon="activity.fields['icon'] || 'mdi:earth'"
		:content="trimString(activity.description, 220)"
		:link="`/activities/${activity.id}`"
		class="p-4"
	/>
</template>

<script setup lang="ts">
import type { Activity } from '@earth-app/crust/src/shared/types/activity';
import { capitalizeFully, trimString } from '@earth-app/crust/src/shared/util';

const colors = ['success', 'warning', 'primary'];

defineProps<{
	activity: Activity;
}>();
</script>
