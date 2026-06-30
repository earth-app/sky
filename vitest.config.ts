import { defineVitestConfig } from '@nuxt/test-utils/config';

export default defineVitestConfig({
	test: {
		environment: 'nuxt',
		include: ['tests/unit/**/*.spec.ts'],
		globals: true,
		setupFiles: ['tests/setup/unit-setup.ts'],
		coverage: {
			provider: 'v8',
			reportsDirectory: 'coverage',
			reporter: ['text', 'json', 'lcov'],
			include: ['src/composables/**', 'src/stores/**', 'src/utils/**', 'src/components/**'],
			exclude: ['**/*.d.ts']
		}
	}
});
