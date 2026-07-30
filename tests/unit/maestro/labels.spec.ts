// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, eachCommand, loadFlows, selectorsForCommand, walk } from './harness';

/**
 * Source root to verify selectors against. `MAESTRO_LABELS_SRC` is an `@internal` seam that
 * lets this spec be pointed at a mutated copy of `src/` to prove it fails on a rename; it is
 * fail-closed, since a wrong or empty root trips the source-inventory assertion below.
 */
const SRC_DIR = process.env.MAESTRO_LABELS_SRC
	? resolve(process.env.MAESTRO_LABELS_SRC)
	: join(REPO_ROOT, 'src');
const SRC_ROOT = dirname(SRC_DIR);

const SOURCE_EXTENSIONS = new Set(['.vue', '.ts', '.css']);

/**
 * Strings owned by the OS, not by sky. They can never be verified against `src/`, so each
 * one is listed with the system surface it belongs to and nothing else is exempt.
 */
const OS_OWNED = new Map<string, string>([
	['Cancel', 'dismiss button on a leftover iOS system alert'],
	['Copy', 'UIActivityViewController activity on iOS'],
	['Done', 'confirm button on the iOS PHPicker photo library sheet'],
	['dismiss popup', 'backdrop dismiss element of the iOS 26 share sheet'],
	['OK', 'confirm button on the @capacitor/camera iOS denial alert'],
	['Photo Library', 'title of the iOS PHPicker sheet'],
	[
		'search text',
		'aria-label ion-searchbar hardcodes on its native input; it inherits only lang and dir from the host, so neither our aria-label nor the placeholder is reachable'
	],
	['Open', 'confirm button on the iOS `Open in "The Earth App"?` scheme prompt'],
	[
		'.*Access to the photos has been prohibited.*',
		'body copy of the @capacitor/camera iOS denial alert, owned by the plugin'
	]
]);

/**
 * Selectors no literal in `src/` can back: either the string is assembled at runtime from a
 * template, or the flow matches it as a regex. Each entry names the source fragment it comes
 * from plus the string the app actually renders, and the test below proves the three agree -
 * so renaming the label in src still fails here, exactly like a plain literal would.
 *
 * `alsoMatches` carries forms the platform a11y bridge decorates onto the rendered string, so
 * `src` cannot produce them literally and only the selector has to cover them.
 */
const DERIVED = new Map<
	string,
	{ file: string; source: string; sample: string; alsoMatches?: string[] }
>([
	[
		'Step 1',
		{
			file: 'src/components/user/quest/MTimeline.vue',
			source: "Step ${index + 1}${item.completed ? ', Completed' : ''}",
			sample: 'Step 1'
		}
	],
	[
		'.*erase all local log files.*',
		{
			file: 'src/pages/tabs/settings/index.vue',
			source: 'This will erase all local log files. Continue?',
			sample: 'This will erase all local log files. Continue?'
		}
	],
	[
		'.*Step #1.*',
		{
			file: 'src/pages/tabs/quests/[id].vue',
			source: 'Step #{{ openStep.index + 1 }}',
			sample: 'Step #1'
		}
	],
	[
		'.*Visual effects re-measured.*',
		{
			file: 'src/pages/tabs/settings/index.vue',
			source: 'Visual effects re-measured: ${visualTierLabel.value}.',
			sample: 'Visual effects re-measured: Reduced - Light Blur.'
		}
	],
	[
		'Automatic \\(.*\\)',
		{
			file: 'src/pages/tabs/settings/index.vue',
			source: 'Automatic (${measuredTierLabel.value})',
			sample: 'Automatic (Reduced - Light Blur)'
		}
	],
	// a closed ion-select composes its accessible name from the label and the value, so no single
	// src fragment renders it; the open option list still exposes the value on its own
	[
		'.*Reduced.*',
		{
			file: 'src/pages/tabs/settings/index.vue',
			source: 'Reduced',
			sample: 'Reduced',
			alsoMatches: ['Visual Effects, Reduced']
		}
	],
	[
		'.*Automatic \\(.*\\).*',
		{
			file: 'src/pages/tabs/settings/index.vue',
			source: 'Automatic (${measuredTierLabel.value})',
			sample: 'Automatic (Reduced - Light Blur)',
			alsoMatches: ['Visual Effects, Automatic (Reduced - Light Blur)']
		}
	],
	// a bare `?` makes the preceding character optional and leaves the rendered one unconsumed, so
	// any literal question mark in a selector has to be escaped
	[
		'Forgot your Password\\?',
		{
			file: 'src/components/user/MLoginForm.vue',
			source: 'Forgot your Password?',
			sample: 'Forgot your Password?'
		}
	],
	[
		'How does this Look\\?',
		{
			file: 'src/components/onboarding/MTextSizePrompt.vue',
			source: 'How does this Look?',
			sample: 'How does this Look?'
		}
	],
	// android folds UFormField's required marker into the label's own text node; ios keeps it a
	// separate element, so a required label needs the optional asterisk to match on both
	[
		'Username or Email\\*?',
		{
			file: 'src/components/user/MLoginForm.vue',
			source: 'Username or Email',
			sample: 'Username or Email',
			alsoMatches: ['Username or Email*']
		}
	],
	[
		'Password\\*?',
		{
			file: 'src/components/user/MLoginForm.vue',
			source: 'Password',
			sample: 'Password',
			alsoMatches: ['Password*']
		}
	],
	[
		'Username\\*?',
		{
			file: 'src/components/user/MSignupForm.vue',
			source: 'Username',
			sample: 'Username',
			alsoMatches: ['Username*']
		}
	]
]);

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** a src template with every hole widened, so it matches anything that template could render */
export function templatePattern(source: string): RegExp {
	// both interpolation forms sky writes: `${x}` in a template literal, `{{ x }}` in markup
	const literals = source.split(/\$\{[^}]*\}|\{\{[^}]*\}\}/g).map(escapeRegex);
	return new RegExp(`^${literals.join('.*')}$`);
}

/** maestro matches a selector against the whole accessible name, so anchor it the same way */
export function selectorPattern(selector: string): RegExp {
	return new RegExp(`^(?:${selector})$`);
}

const sourceFiles = walk(SRC_DIR)
	.filter((path) => SOURCE_EXTENSIONS.has(extname(path)))
	.map((path) => ({ rel: relative(SRC_ROOT, path), body: readFileSync(path, 'utf8') }));

type Selector = { flow: string; key: string; value: string };

const selectors: Selector[] = loadFlows().flatMap((flow) =>
	eachCommand(flow.commands).flatMap(({ name, payload }) =>
		selectorsForCommand(name, payload).map(({ key, value }) => ({ flow: flow.rel, key, value }))
	)
);

function filesContaining(needle: string): string[] {
	return sourceFiles.filter((file) => file.body.includes(needle)).map((file) => file.rel);
}

const textSelectors = selectors.filter(
	(selector) => selector.key === 'text' && !selector.value.includes('${')
);
const idSelectors = selectors.filter(
	(selector) => selector.key === 'id' && !selector.value.includes('${')
);
const uniqueText = [...new Set(textSelectors.map((selector) => selector.value))].sort();

describe('maestro selector contract', () => {
	it('collects a real selector inventory', () => {
		expect(uniqueText.length).toBeGreaterThan(30);
	});

	it('reads a real source tree, so a wrong root cannot pass vacuously', () => {
		expect(sourceFiles.length).toBeGreaterThan(100);
		expect(sourceFiles.map((file) => file.rel)).toContain('src/pages/tabs.vue');
	});

	it('backs every text selector with a string that exists in src/', () => {
		const missing: string[] = [];
		for (const value of uniqueText) {
			if (OS_OWNED.has(value) || DERIVED.has(value)) continue;
			if (filesContaining(value).length === 0) {
				const flows = textSelectors
					.filter((selector) => selector.value === value)
					.map((selector) => selector.flow);
				missing.push(`"${value}" (used by ${[...new Set(flows)].join(', ')})`);
			}
		}
		expect(missing, 'selectors with no matching aria-label or visible text in src/').toEqual([]);
	});

	it('backs every id selector with a matching dom id in src/', () => {
		const missing: string[] = [];
		for (const value of [...new Set(idSelectors.map((selector) => selector.value))].sort()) {
			if (filesContaining(`id="${value}"`).length === 0) missing.push(value);
		}
		expect(missing, 'id selectors with no matching id attribute in src/').toEqual([]);
	});

	it('keeps the OS-owned exemption list minimal and honest', () => {
		for (const [value, surface] of OS_OWNED) {
			expect(surface.length, `${value} needs a reason`).toBeGreaterThan(10);
			expect(uniqueText, `${value} is exempt but no flow uses it`).toContain(value);
		}
	});

	it('backs every derived selector with the src fragment that renders it', () => {
		for (const [selector, { file, source, sample, alsoMatches }] of DERIVED) {
			expect(filesContaining(source), `${selector}: source fragment renamed or moved`).toContain(
				file
			);
			expect(
				templatePattern(source).test(sample),
				`${selector}: ${file} cannot render "${sample}"`
			).toBe(true);
			for (const rendered of [sample, ...(alsoMatches ?? [])]) {
				expect(
					selectorPattern(selector).test(rendered),
					`${selector} never matches "${rendered}"`
				).toBe(true);
			}
		}
	});

	it('keeps the derived list minimal and honest', () => {
		for (const selector of DERIVED.keys()) {
			expect(uniqueText, `${selector} is declared derived but no flow uses it`).toContain(selector);
		}
	});

	it('would notice a required label that drops the android asterisk', () => {
		// the whole reason the required selectors carry `\*?`: maestro matches literally or on a
		// FULL regex, never a substring, so the bare label silently misses android's own text node
		expect(selectorPattern('Username or Email').test('Username or Email*')).toBe(false);
		expect(selectorPattern('Username or Email\\*?').test('Username or Email*')).toBe(true);
		expect(selectorPattern('Username or Email\\*?').test('Username or Email')).toBe(true);
		// and it must not widen into a different field
		expect(selectorPattern('Username\\*?').test('Username or Email*')).toBe(false);
	});

	it('would notice a renamed label', () => {
		// positive control: proves filesContaining actually discriminates rather than
		// matching everything through some accidental substring
		expect(filesContaining('Open Your Profile').length).toBeGreaterThan(0);
		expect(filesContaining('Open Your Profile Renamed')).toEqual([]);
		expect(filesContaining('Create Content')).toContain('src/pages/tabs.vue');
	});

	it('would notice a renamed template, and never matches a wider name', () => {
		expect(templatePattern('Step ${index + 1}').test('Step 4')).toBe(true);
		expect(templatePattern('Stage ${index + 1}').test('Step 4')).toBe(false);
		expect(templatePattern('Step #{{ openStep.index + 1 }}').test('Step #4')).toBe(true);
		expect(templatePattern('Step #{{ openStep.index + 1 }}').test('Stage #4')).toBe(false);
		// maestro anchors a selector to the whole name, which is the only reason `Step 1` is
		// unambiguous on the 12-step quest, and why `, Completed` reads as a different tile
		expect(selectorPattern('Step 1').test('Step 10')).toBe(false);
		expect(selectorPattern('Step 1').test('Step 1, Completed')).toBe(false);
		expect(selectorPattern('Automatic \\(.*\\)').test('Automatic (Off - Solid Surfaces)')).toBe(
			true
		);
	});

	it('pins the shell selectors the whole suite is built on', () => {
		// these four tab labels plus the FAB are load-bearing for every native flow; if one
		// moves, the failure should read as a contract break, not a mystery tap timeout
		expect(filesContaining('aria-label="Dashboard"')).toContain('src/pages/tabs.vue');
		expect(filesContaining('aria-label="Quests"')).toContain('src/pages/tabs.vue');
		expect(filesContaining('aria-label="Discover"')).toContain('src/pages/tabs.vue');
		expect(filesContaining('aria-label="Profile"')).toContain('src/pages/tabs.vue');
		expect(filesContaining('aria-label="Create Content"')).toContain('src/pages/tabs.vue');
		expect(filesContaining('aria-label="Open Your Profile"')).toContain(
			'src/pages/tabs/dashboard.vue'
		);
	});

	it('pins the quest timeline labels the step flow taps', () => {
		// the tiles are UBadge spans with no visible text; without these names the whole
		// quest-step surface is unreachable from a flow
		expect(filesContaining(':aria-label="`Step ${index + 1}')).toContain(
			'src/components/user/quest/MTimeline.vue'
		);
		expect(filesContaining('aria-label="Quest Reward"')).toContain(
			'src/components/user/quest/MTimeline.vue'
		);
		expect(filesContaining('aria-label="Close quest step"')).toContain(
			'src/pages/tabs/quests/[id].vue'
		);
		expect(filesContaining('Start this quest to unlock the step interface.')).toContain(
			'src/components/user/quest/step/MSubmission.vue'
		);
	});

	it('pins the profile header controls and the share button', () => {
		expect(filesContaining('aria-label="Settings"')).toContain('src/pages/tabs/profile/[id].vue');
		// no flow taps the bell yet; it is the settings button's only neighbour in that
		// IonButtons group, so a lost name there would move the settings hitbox
		expect(filesContaining('aria-label="Notifications"')).toContain(
			'src/pages/tabs/profile/[id].vue'
		);
		expect(filesContaining('aria-label="Share"')).toContain('src/components/Share.vue');
	});

	it('pins the settings rows the visual-effects flow drives', () => {
		const settings = sourceFiles.find((file) => file.rel === 'src/pages/tabs/settings/index.vue');
		expect(settings, 'src/pages/tabs/settings/index.vue exists').toBeDefined();
		// the IonSelect label is rendered text (label-placement fixed), unlike the host
		// aria-label ionic drops on IonInput / IonSearchbar
		expect(settings!.body).toContain(':label="item.title"');
		expect(settings!.body).toContain("title: 'Visual Effects'");
		expect(settings!.body).toContain("title: 'Re-check This Device'");
		expect(settings!.body).toContain("'Re-check'");
		expect(filesContaining("{ label: 'Reduced', value: 'reduced' }")).toContain(
			'src/pages/tabs/settings/index.vue'
		);
	});

	it('pins the login placeholders the sign-in flow types into', () => {
		expect(filesContaining('placeholder="cooldude78 or you@example.com"')).toContain(
			'src/components/user/MLoginForm.vue'
		);
		expect(filesContaining('placeholder="SuperSecretPassword_"')).toContain(
			'src/components/user/MLoginForm.vue'
		);
		expect(filesContaining('label="Username or Email"')).toContain(
			'src/components/user/MLoginForm.vue'
		);
	});

	it('pins the splash-clear assertion to the only page that hides the splash', () => {
		const indexPage = sourceFiles.find((file) => file.rel === 'src/pages/index.vue');
		expect(indexPage, 'src/pages/index.vue exists').toBeDefined();
		expect(indexPage!.body).toContain('SplashScreen.hide()');
		expect(indexPage!.body).toContain('The Earth App');
		// launchAutoHide stays false, which is what makes "content rendered" a real assertion
		const capacitorConfig = readFileSync(join(REPO_ROOT, 'capacitor.config.ts'), 'utf8');
		expect(capacitorConfig).toContain('launchAutoHide: false');
	});
});
