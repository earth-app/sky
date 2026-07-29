// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { babelParse, parse } from 'vue/compiler-sfc';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_DIR = join(REPO_ROOT, 'src');

// nuxt injects these; unimport skips the injection for the whole module when the
// same name is bound locally, so a param named `ref` strands every other `ref`
const AUTO_IMPORTED = new Set([
	'computed',
	'customRef',
	'effectScope',
	'h',
	'inject',
	'nextTick',
	'provide',
	'reactive',
	'readonly',
	'ref',
	'shallowReactive',
	'shallowReadonly',
	'shallowRef',
	'toRef',
	'toRefs',
	'toValue',
	'unref',
	'useState',
	'watch',
	'watchEffect'
]);

const PARAM_OWNERS = new Set([
	'ArrowFunctionExpression',
	'ClassMethod',
	'ClassPrivateMethod',
	'FunctionDeclaration',
	'FunctionExpression',
	'ObjectMethod'
]);

type Node = { type?: string; [key: string]: unknown };

function collectBindings(pattern: unknown, out: Set<string>): void {
	if (!pattern || typeof pattern !== 'object') return;
	const node = pattern as Node & { name?: string };
	switch (node.type) {
		case 'Identifier':
			if (node.name) out.add(node.name);
			return;
		case 'AssignmentPattern':
			return collectBindings(node.left, out);
		case 'RestElement':
			return collectBindings(node.argument, out);
		case 'TSParameterProperty':
			return collectBindings(node.parameter, out);
		case 'ObjectPattern':
			for (const property of (node.properties as Node[]) ?? [])
				collectBindings(property.value ?? property.argument, out);
			return;
		case 'ArrayPattern':
			for (const element of (node.elements as Node[]) ?? []) collectBindings(element, out);
			return;
	}
}

/** auto-imported names a module both calls and binds as a parameter */
export function shadowedAutoImports(source: string): string[] {
	const ast = babelParse(source, { sourceType: 'module', plugins: ['typescript'] });
	const called = new Set<string>();
	const bound = new Set<string>();
	const seen = new Set<object>();

	const visit = (value: unknown): void => {
		if (!value || typeof value !== 'object' || seen.has(value)) return;
		if (Array.isArray(value)) {
			for (const entry of value) visit(entry);
			return;
		}
		const node = value as Node;
		if (typeof node.type !== 'string') return;
		seen.add(value);

		const callee = node.callee as Node | undefined;
		if (node.type === 'CallExpression' && callee?.type === 'Identifier')
			called.add(callee.name as string);
		if (PARAM_OWNERS.has(node.type))
			for (const param of (node.params as unknown[]) ?? []) collectBindings(param, bound);
		if (node.type === 'CatchClause') collectBindings(node.param, bound);

		// type-level params are stripped before unimport runs, so they never shadow
		if (node.type.startsWith('TS') && node.type !== 'TSParameterProperty') return;

		for (const [key, child] of Object.entries(node)) {
			if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
			if (child && typeof child === 'object') visit(child);
		}
	};

	visit(ast.program);
	return [...called].filter((name) => AUTO_IMPORTED.has(name) && bound.has(name)).sort();
}

function walkFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const abs = join(dir, entry);
		return statSync(abs).isDirectory() ? walkFiles(abs) : [abs];
	});
}

function scriptBlocks(file: string): string[] {
	const source = readFileSync(file, 'utf8');
	if (file.endsWith('.ts')) return [source];
	const { descriptor } = parse(source);
	return [descriptor.script?.content, descriptor.scriptSetup?.content].filter(
		(block): block is string => !!block
	);
}

describe('shadowedAutoImports', () => {
	it('flags a parameter that shadows an auto-import the module also calls', () => {
		const source = [
			'export function distanceStorageKey(ref: { questId: string }): string {',
			'	return ref.questId;',
			'}',
			'const granted = ref<boolean | null>(null);',
			'export { granted };'
		].join('\n');
		expect(shadowedAutoImports(source)).toEqual(['ref']);
	});

	it('accepts the same module once the parameter is renamed', () => {
		const source = [
			'export function distanceStorageKey(stepRef: { questId: string }): string {',
			'	return stepRef.questId;',
			'}',
			'const granted = ref<boolean | null>(null);',
			'export { granted };'
		].join('\n');
		expect(shadowedAutoImports(source)).toEqual([]);
	});

	it('ignores a shadowing binding when the module never calls the name', () => {
		const source = 'export const withHandle = (h: { remove: () => void }) => h.remove();';
		expect(shadowedAutoImports(source)).toEqual([]);
	});

	it('ignores a name that only appears as a type-level parameter', () => {
		const source = [
			'type Factory = (ref: string) => string;',
			'export const make: Factory = (value) => value;',
			'const count = ref(0);',
			'export { count };'
		].join('\n');
		expect(shadowedAutoImports(source)).toEqual([]);
	});

	it('flags a destructured parameter too', () => {
		const source = [
			'export function read({ watch }: { watch: boolean }) {',
			'	return watch;',
			'}',
			'watch(() => 1, () => {});'
		].join('\n');
		expect(shadowedAutoImports(source)).toEqual(['watch']);
	});
});

describe('src never shadows an auto-import it relies on', () => {
	const files = walkFiles(SRC_DIR)
		.filter((file) => file.endsWith('.ts') || file.endsWith('.vue'))
		.sort();

	it('scans every source module', () => {
		expect(files.length).toBeGreaterThan(100);
	});

	it('finds no module that binds an auto-imported name it also calls', () => {
		const offenders = files.flatMap((file) =>
			scriptBlocks(file)
				.flatMap((block) => shadowedAutoImports(block))
				.map((name) => `${relative(REPO_ROOT, file)}: ${name}`)
		);
		expect(offenders).toEqual([]);
	});
});
