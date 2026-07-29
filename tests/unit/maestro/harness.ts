import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAllDocuments } from 'yaml';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const MAESTRO_DIR = join(REPO_ROOT, '.maestro');
export const FLOWS_DIR = join(MAESTRO_DIR, 'flows');
export const CONFIG_PATH = join(MAESTRO_DIR, 'config.yaml');

export const APP_ID = 'com.earthapp.sky';

/** keys that nest another element selector inside a command payload */
const SELECTOR_CONTAINER_KEYS = new Set([
	'above',
	'below',
	'childOf',
	'containsChild',
	'containsDescendants',
	'element',
	'leftOf',
	'notVisible',
	'rightOf',
	'visible'
]);

/** the only payload keys maestro ever matches against the accessibility tree */
const SELECTOR_STRING_KEYS = new Set(['text', 'id', 'css']);

/** commands whose whole payload may be the shorthand `command: <text>` form */
const SELECTOR_COMMANDS = new Set([
	'assertNotVisible',
	'assertVisible',
	'copyTextFrom',
	'doubleTapOn',
	'longPressOn',
	'tapOn'
]);

export type FlowFile = {
	/** repo-relative path, used verbatim in assertion messages */
	rel: string;
	abs: string;
	config: Record<string, unknown>;
	commands: unknown[];
};

export type FlowCommand = { name: string; payload: unknown };
export type SelectorString = { key: string; value: string };

export function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).flatMap((entry) => {
		const abs = join(dir, entry);
		return statSync(abs).isDirectory() ? walk(abs) : [abs];
	});
}

export function loadFlow(abs: string): FlowFile {
	const docs = parseAllDocuments(readFileSync(abs, 'utf8'));
	const errors = docs.flatMap((doc) => doc.errors);
	if (errors.length > 0) {
		throw new Error(
			`${relative(REPO_ROOT, abs)}: ${errors.map((error) => error.message).join('; ')}`
		);
	}
	return {
		rel: relative(REPO_ROOT, abs),
		abs,
		config: (docs[0]?.toJS() ?? {}) as Record<string, unknown>,
		commands: (docs[1]?.toJS() ?? []) as unknown[]
	};
}

/**
 * Every `.maestro/flows/**\/*.yml` file, parsed. Lives here rather than in a `*.spec.ts` so
 * both harness specs can share it without re-registering each other's tests.
 */
export function loadFlows(): FlowFile[] {
	return walk(FLOWS_DIR)
		.filter((path) => path.endsWith('.yml'))
		.sort()
		.map(loadFlow);
}

export function loadWorkspaceConfig(): Record<string, unknown> {
	if (!existsSync(CONFIG_PATH)) return {};
	const docs = parseAllDocuments(readFileSync(CONFIG_PATH, 'utf8'));
	if (docs.flatMap((doc) => doc.errors).length > 0)
		throw new Error('.maestro/config.yaml is not valid yaml');
	return (docs[0]?.toJS() ?? {}) as Record<string, unknown>;
}

/** every `{ commandName: payload }` pair, including nested runFlow / repeat / retry bodies */
export function eachCommand(commands: unknown[]): FlowCommand[] {
	const out: FlowCommand[] = [];
	for (const entry of commands) {
		if (typeof entry === 'string') {
			out.push({ name: entry, payload: null });
			continue;
		}
		if (!entry || typeof entry !== 'object') continue;
		for (const [name, payload] of Object.entries(entry as Record<string, unknown>)) {
			out.push({ name, payload });
			const nested = (payload as { commands?: unknown[] } | null)?.commands;
			if (Array.isArray(nested)) out.push(...eachCommand(nested));
		}
	}
	return out;
}

/** every string a command hands to the accessibility-tree matcher */
export function collectSelectorStrings(node: unknown): SelectorString[] {
	if (!node || typeof node !== 'object') return [];
	if (Array.isArray(node)) return node.flatMap(collectSelectorStrings);

	const out: SelectorString[] = [];
	for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
		if (typeof child === 'string') {
			if (SELECTOR_STRING_KEYS.has(key)) out.push({ key, value: child });
			// `visible: Foo` is maestro shorthand for `visible: { text: Foo }`
			else if (SELECTOR_CONTAINER_KEYS.has(key)) out.push({ key: 'text', value: child });
			continue;
		}
		if (SELECTOR_CONTAINER_KEYS.has(key) || key === 'commands' || typeof child === 'object') {
			out.push(...collectSelectorStrings(child));
		}
	}
	return out;
}

/** collectSelectorStrings plus the `command: <text>` shorthand maestro allows */
export function selectorsForCommand(name: string, payload: unknown): SelectorString[] {
	if (typeof payload === 'string') {
		return SELECTOR_COMMANDS.has(name) ? [{ key: 'text', value: payload }] : [];
	}
	return collectSelectorStrings(payload);
}
