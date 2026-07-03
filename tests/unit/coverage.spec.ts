import { describe, expect, it } from 'vitest';
import { PROJECT_ROOT, toLcov, toRepoRelative } from '../e2e/utils/coverage';

describe('toRepoRelative', () => {
	it('strips the absolute project-root prefix to a repo-relative src path', () => {
		const abs = `${PROJECT_ROOT}/src/composables/useNotify.ts`;
		expect(toRepoRelative(abs)).toBe('src/composables/useNotify.ts');
	});

	it('falls back to the first src/ segment for a path outside the project root', () => {
		const foreign = '/zzz-foreign-root/src/composables/useDeepLinkRouting.ts';
		expect(toRepoRelative(foreign)).toBe('src/composables/useDeepLinkRouting.ts');
	});

	it('leaves an already-relative path untouched', () => {
		expect(toRepoRelative('src/composables/useSettings.ts')).toBe('src/composables/useSettings.ts');
	});

	it('returns falsy input unchanged', () => {
		expect(toRepoRelative('')).toBe('');
	});
});

describe('toLcov', () => {
	it('emits repo-relative SF: paths and never an absolute CI path', () => {
		const merged = {
			'src/composables/useNotify.ts': {
				path: 'src/composables/useNotify.ts',
				statementMap: { '0': { start: { line: 1 }, end: { line: 1 } } },
				fnMap: {},
				branchMap: {},
				s: { '0': 3 },
				f: {},
				b: {}
			}
		};
		const lcov = toLcov(merged);
		expect(lcov).toContain('SF:src/composables/useNotify.ts');
		expect(lcov).not.toContain('/home/runner');
		expect(lcov).toContain('end_of_record');
	});
});
