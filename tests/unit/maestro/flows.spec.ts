// @vitest-environment node
import { existsSync, lstatSync, readdirSync, readlinkSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	APP_ID,
	CONFIG_PATH,
	MAESTRO_DIR,
	REPO_ROOT,
	eachCommand,
	loadFlows,
	loadWorkspaceConfig,
	selectorsForCommand,
	walk
} from './harness';

const LANE_TAGS = ['gate', 'eval'];

const REQUIRED_FLOWS = [
	'.maestro/flows/_shared/launch-clean.yml',
	'.maestro/flows/_shared/sign-in.yml',
	'.maestro/flows/smoke/launch.yml',
	'.maestro/flows/smoke/signin-browse.yml',
	'.maestro/flows/native/permissions-camera.yml',
	'.maestro/flows/native/permissions-location.yml',
	'.maestro/flows/native/permissions-notifications.yml',
	'.maestro/flows/native/deep-link.yml',
	'.maestro/flows/native/oauth-roundtrip.yml',
	'.maestro/flows/native/share-sheet.yml',
	'.maestro/flows/native/photo-capture.yml',
	'.maestro/flows/native/distance-step.yml',
	'.maestro/flows/native/webview-recovery.yml',
	'.maestro/flows/native/cold-relaunch.yml',
	'.maestro/flows/native/quest-step.yml',
	'.maestro/flows/native/settings-visual-effects.yml'
];

// every key YamlFluentCommand accepts in maestro 2.7; anything else is a typo that would
// otherwise only surface as a parse failure on a booted device
const KNOWN_COMMANDS = new Set([
	'action',
	'addMedia',
	'assertNoDefectsWithAI',
	'assertNotVisible',
	'assertScreenshot',
	'assertTrue',
	'assertVisible',
	'assertWithAI',
	'back',
	'clearKeychain',
	'clearState',
	'copyTextFrom',
	'doubleTapOn',
	'eraseText',
	'evalScript',
	'extendedWaitUntil',
	'extractTextWithAI',
	'hideKeyboard',
	'inputRandomCityName',
	'inputRandomColorName',
	'inputRandomCountryName',
	'inputRandomEmail',
	'inputRandomNumber',
	'inputRandomPersonName',
	'inputRandomText',
	'inputText',
	'killApp',
	'launchApp',
	'longPressOn',
	'openBrowser',
	'openLink',
	'pasteText',
	'pressKey',
	'repeat',
	'retry',
	'runFlow',
	'runScript',
	'scroll',
	'scrollUntilVisible',
	'setAirplaneMode',
	'setClipboard',
	'setLocation',
	'setOrientation',
	'setPermissions',
	'startRecording',
	'stopApp',
	'stopRecording',
	'swipe',
	'takeScreenshot',
	'tapOn',
	'toggleAirplaneMode',
	'travel',
	'waitForAnimationToEnd'
]);

// assertScreenshot needs committed PNG baselines; the AI asserts call an undisclosed
// third-party model and default to optional, so a failure would never fail CI
const BANNED_COMMANDS = new Set([
	'assertNoDefectsWithAI',
	'assertScreenshot',
	'assertWithAI',
	'extractTextWithAI'
]);

const ASSERTION_COMMANDS = new Set([
	'assertVisible',
	'assertNotVisible',
	'assertTrue',
	'extendedWaitUntil'
]);

// utility-class shape: an all-lowercase token out of tailwind's vocabulary, optionally
// variant-prefixed and optionally `!`-suffixed. no accessible name in sky looks like this
const TAILWIND_HEAD = [
	'absolute|accent|animate|antialiased|appearance|aspect|backdrop|basis|bg|block|blur|border',
	'bottom|box|break|capitalize|caret|clear|col|collapse|contents|content|cursor|dark|decoration',
	'delay|divide|duration|ease|even|fill|filter|first|fixed|flex|float|font|from|gap|grid|group',
	'grow|h|has|hidden|inline|inset|invisible|isolate|italic|items|justify|last|leading|left|light',
	'line|list|lowercase|m|mask|max|mb|min|mix|ml|motion|mr|mt|mx|my|not|object|odd|opacity|order',
	'outline|overflow|p|pb|peer|pl|place|pointer|pr|pt|px|py|relative|resize|right|ring|rotate',
	'rounded|row|scale|select|self|shadow|shrink|size|snap|space|sr|static|sticky|stroke|table',
	'text|top|touch|tracking|transform|transition|translate|truncate|underline|uppercase|via|w',
	'whitespace|will|z'
].join('|');
const TAILWIND_SHAPED = new RegExp(
	`^(?:[a-z0-9-]+:)*!?(?:${TAILWIND_HEAD})(?:-[a-z0-9./%[\\]()#-]+)*!?$`
);

/** a `.foo` / `#foo` css selector, or a tailwind utility string */
export function looksLikeStyleSelector(value: string): boolean {
	const trimmed = value.trim();
	if (/^[.#][A-Za-z_-]/.test(trimmed)) return true;
	return TAILWIND_SHAPED.test(trimmed);
}

export function looksLikeTestId(value: string): boolean {
	return /data-test(id)?/i.test(value);
}

const flows = loadFlows();
const everyCommand = flows.flatMap((flow) =>
	eachCommand(flow.commands).map((command) => ({ ...command, flow }))
);

describe('maestro flow files', () => {
	it('covers every flow the plan requires', () => {
		const rels = flows.map((flow) => flow.rel);
		for (const expected of REQUIRED_FLOWS) expect(rels).toContain(expected);
	});

	it('parses every flow as a config document plus a command document', () => {
		for (const flow of flows) {
			expect(flow.config, flow.rel).toBeTypeOf('object');
			expect(Array.isArray(flow.commands), `${flow.rel} has a commands document`).toBe(true);
			expect(flow.commands.length, `${flow.rel} has commands`).toBeGreaterThan(0);
		}
	});

	it('targets only the sky bundle id', () => {
		for (const flow of flows) expect(flow.config.appId, flow.rel).toBe(APP_ID);
		for (const { name, payload, flow } of everyCommand) {
			const appId = (payload as { appId?: string } | null)?.appId;
			if (typeof appId === 'string') expect(appId, `${flow.rel}: ${name}`).toBe(APP_ID);
		}
	});

	it('tags every flow with exactly one lane', () => {
		for (const flow of flows) {
			const tags = flow.config.tags;
			expect(Array.isArray(tags), `${flow.rel} declares tags`).toBe(true);
			const lanes = (tags as string[]).filter((tag) => LANE_TAGS.includes(tag));
			expect(lanes, `${flow.rel} lane tags`).toHaveLength(1);
		}
	});

	it('populates both lanes so --include-tags actually splits them', () => {
		for (const lane of LANE_TAGS) {
			const inLane = flows.filter((flow) => (flow.config.tags as string[]).includes(lane));
			expect(inLane.length, `${lane} lane is empty`).toBeGreaterThan(0);
		}
	});

	it('never lets a launchApp reset a permission the flow just set', () => {
		for (const flow of flows) {
			let sawSetPermissions = false;
			const offenders: string[] = [];
			for (const { name, payload } of eachCommand(flow.commands)) {
				if (name === 'setPermissions') sawSetPermissions = true;
				if (name === 'launchApp') {
					const hasMap = Boolean((payload as { permissions?: unknown } | null)?.permissions);
					if (sawSetPermissions && !hasMap) offenders.push(name);
				}
			}
			expect(
				offenders,
				`${flow.rel}: a launchApp after a setPermissions needs its own permissions map`
			).toEqual([]);
		}
	});

	it('uses only real maestro commands', () => {
		for (const { name, flow } of everyCommand) {
			expect(KNOWN_COMMANDS.has(name), `${flow.rel}: "${name}" is not a maestro command`).toBe(
				true
			);
		}
	});

	it('avoids the commands the plan ruled out', () => {
		for (const { name, flow } of everyCommand) {
			expect(BANNED_COMMANDS.has(name), `${flow.rel}: "${name}" is banned`).toBe(false);
		}
	});

	it('never keys a selector off a data-testid, a dom id, a css selector, or a tailwind class', () => {
		for (const { name, payload, flow } of everyCommand) {
			for (const { key, value } of selectorsForCommand(name, payload)) {
				expect(key, `${flow.rel}: ${name} uses a raw css selector`).not.toBe('css');
				// verified against a device hierarchy dump: WKWebView publishes no resource-id for
				// DOM content, so an `id:` selector silently never matches on iOS
				expect(key, `${flow.rel}: ${name} uses an id selector, which iOS never exposes`).not.toBe(
					'id'
				);
				expect(looksLikeTestId(value), `${flow.rel}: ${name} selects on "${value}"`).toBe(false);
				expect(
					looksLikeStyleSelector(value),
					`${flow.rel}: ${name} selects on style-shaped "${value}"`
				).toBe(false);
			}
		}
	});

	it('resolves every runFlow path', () => {
		const runFlows = everyCommand.filter(({ name }) => name === 'runFlow');
		expect(runFlows.length).toBeGreaterThan(0);
		for (const { payload, flow } of runFlows) {
			const file =
				typeof payload === 'string' ? payload : (payload as { file?: string } | null)?.file;
			if (!file) {
				// a conditional runFlow may inline its body instead of pointing at a file
				expect(
					Array.isArray((payload as { commands?: unknown[] } | null)?.commands),
					`${flow.rel}: runFlow has neither file nor commands`
				).toBe(true);
				continue;
			}
			expect(file.endsWith('.yml'), `${flow.rel}: runFlow ${file} must be a .yml`).toBe(true);
			expect(
				existsSync(resolve(dirname(flow.abs), file)),
				`${flow.rel}: runFlow ${file} does not resolve`
			).toBe(true);
		}
	});

	it('resolves every addMedia fixture to a file already in the repo', () => {
		const mediaCommands = everyCommand.filter(({ name }) => name === 'addMedia');
		expect(mediaCommands.length).toBeGreaterThan(0);
		for (const { payload, flow } of mediaCommands) {
			const files = Array.isArray(payload)
				? (payload as string[])
				: ((payload as { files?: string[] } | null)?.files ?? []);
			expect(files.length, `${flow.rel}: addMedia has no files`).toBeGreaterThan(0);
			for (const file of files) {
				expect(
					existsSync(resolve(dirname(flow.abs), file)),
					`${flow.rel}: addMedia ${file} does not resolve`
				).toBe(true);
			}
		}
	});

	it('keeps config.yaml as the only .yaml in the workspace', () => {
		const yamlFiles = walk(MAESTRO_DIR)
			.filter((path) => path.endsWith('.yaml'))
			.map((path) => relative(REPO_ROOT, path));
		expect(yamlFiles).toEqual(['.maestro/config.yaml']);
	});

	it('holds no real binaries, only symlinks to assets the repo already ships', () => {
		const nonYaml = walk(MAESTRO_DIR).filter((path) => !/\.ya?ml$/.test(path));
		for (const path of nonYaml) {
			const rel = relative(REPO_ROOT, path);
			expect(lstatSync(path).isSymbolicLink(), `${rel} is a committed binary`).toBe(true);
			expect(existsSync(path), `${rel} is a broken symlink`).toBe(true);
			const target = resolve(dirname(path), readlinkSync(path));
			expect(target.startsWith(MAESTRO_DIR), `${rel} should point outside .maestro`).toBe(false);
			expect(target.startsWith(REPO_ROOT), `${rel} should point inside the repo`).toBe(true);
		}
	});

	it('never marks an assertion optional', () => {
		for (const { name, payload, flow } of everyCommand) {
			if (!ASSERTION_COMMANDS.has(name)) continue;
			const optional = (payload as { optional?: boolean } | null)?.optional;
			expect(
				optional,
				`${flow.rel}: ${name} is optional, so a real failure would pass CI`
			).not.toBe(true);
		}
	});

	it('never waits on a fixed timer, only on animation end or a bounded condition', () => {
		for (const flow of flows) {
			const body = JSON.stringify(flow.commands);
			expect(body, `${flow.rel} uses a fixed sleep`).not.toContain('waitForTimeout');
		}
		const waits = everyCommand.filter(({ name }) =>
			['waitForAnimationToEnd', 'extendedWaitUntil'].includes(name)
		);
		expect(waits.length).toBeGreaterThan(0);
	});

	// maestro sandboxes screenshots under <--test-output-dir>/<flow>/takeScreenshot/<path>, so a
	// relative path can never land in the repo while an absolute one only adds a bogus prefix
	it('writes screenshots to relative paths so nothing lands in the repo', () => {
		const shots = everyCommand
			.filter(({ name }) => name === 'takeScreenshot')
			.map(({ payload, flow }) => ({
				rel: flow.rel,
				path: typeof payload === 'string' ? payload : (payload as { path?: string } | null)?.path
			}));
		expect(shots.length).toBeGreaterThan(0);
		for (const shot of shots) {
			expect(shot.path, `${shot.rel}: takeScreenshot needs an explicit path`).toBeTypeOf('string');
			expect(shot.path?.startsWith('/'), `${shot.rel}: ${shot.path} must be relative`).toBe(false);
			expect(shot.path?.includes('..'), `${shot.rel}: ${shot.path} must not escape upward`).toBe(
				false
			);
			expect(shot.path?.endsWith('.png'), `${shot.rel}: maestro appends the extension`).toBe(false);
		}
	});
});

describe('maestro workspace config', () => {
	const config = loadWorkspaceConfig() as { appId?: string; flows?: string[] };

	it('exists under the exact name maestro requires', () => {
		expect(existsSync(CONFIG_PATH)).toBe(true);
		expect(existsSync(join(MAESTRO_DIR, 'config.yml'))).toBe(false);
	});

	it('declares the sky bundle id and the two runnable suites', () => {
		expect(config.appId).toBe(APP_ID);
		expect(config.flows).toEqual(['flows/smoke/*.yml', 'flows/native/*.yml']);
	});

	it('leaves _shared out of the runnable set', () => {
		for (const glob of config.flows ?? []) {
			expect(glob).not.toContain('_shared');
			const dir = join(MAESTRO_DIR, dirname(glob));
			expect(existsSync(dir), `${glob} points at a real directory`).toBe(true);
			expect(readdirSync(dir).some((file) => file.endsWith('.yml'))).toBe(true);
		}
	});
});

describe('selector guards', () => {
	it('flags style-shaped strings', () => {
		for (const value of [
			'flex',
			'm-glass',
			'text-sm',
			'min-w-11!',
			'dark:bg-primary/10',
			'.tab-selected',
			'#navbar',
			'size-9',
			'z-2',
			'motion-safe:animate-pulse'
		]) {
			expect(looksLikeStyleSelector(value), value).toBe(true);
		}
	});

	it('leaves real accessible names and dom ids alone', () => {
		for (const value of [
			'Dashboard',
			'Create Content',
			'Open Your Profile',
			'Time Outside',
			"You're all caught up",
			'Find your Novelty, Try New Things, Discover the World',
			'cooldude78 or you@example.com',
			'Be the First to Leave One.',
			'Within',
			'Back',
			'navbar',
			'settings-link',
			'trailmark-radius',
			'user-invite',
			'discover-segments',
			'quest-search'
		]) {
			expect(looksLikeStyleSelector(value), value).toBe(false);
		}
	});

	it('flags testid selectors in any casing', () => {
		expect(looksLikeTestId('data-testid=harness-ready')).toBe(true);
		expect(looksLikeTestId('[data-test="x"]')).toBe(true);
		expect(looksLikeTestId('Dashboard')).toBe(false);
	});
});
