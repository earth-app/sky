<template></template>

<script setup lang="ts">
import type { OAuthProvider } from '@earth-app/crust/src/shared/types/user';

const props = defineProps<{
	provider: OAuthProvider;
}>();
</script>
