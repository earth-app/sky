// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hexToOklch, parseOklch, type Oklch } from './oklch';

const CSS = readFileSync(new URL('../../../src/assets/css/main.css', import.meta.url), 'utf8');

// comments quote css that would otherwise trip the selector/token scans
const SOURCE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const RAMPS = ['ink', 'brand', 'danger', 'warning'] as const;

const BRAND_HEX = '#1ebb48';

function declaration(name: string): string | null {
	const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(SOURCE);
	return match ? match[1]!.trim() : null;
}

function ramp(family: string): Oklch[] {
	return SHADES.map((shade) => {
		const raw = declaration(`color-${family}-${shade}`);
		expect(raw, `--color-${family}-${shade} is declared`).toBeTruthy();

		const parsed = parseOklch(raw!);
		expect(parsed, `--color-${family}-${shade} parses as oklch(): ${raw}`).not.toBeNull();
		return parsed!;
	});
}

function layerBlocks(): { name: string; body: string }[] {
	const blocks: { name: string; body: string }[] = [];
	const opener = /@layer\s+([\w-]+)\s*\{/g;

	let match: RegExpExecArray | null;
	while ((match = opener.exec(SOURCE))) {
		let depth = 1;
		let i = match.index + match[0].length;
		const start = i;

		while (i < SOURCE.length && depth > 0) {
			if (SOURCE[i] === '{') depth++;
			else if (SOURCE[i] === '}') depth--;
			i++;
		}

		blocks.push({ name: match[1]!, body: SOURCE.slice(start, i - 1) });
		opener.lastIndex = i;
	}

	return blocks;
}

function layerStatementNames(): string[] {
	const statement = /@layer\s+([^;{]+);/.exec(SOURCE);
	expect(statement, 'main.css declares an @layer order statement').not.toBeNull();
	return statement![1]!.split(',').map((name) => name.trim());
}

describe('layer order statement', () => {
	it('is the first at-rule in the file, ahead of every @import', () => {
		const first = /@[a-z-]+[^;{]*[;{]/i.exec(SOURCE);
		expect(first).not.toBeNull();
		expect(first![0]!.startsWith('@layer ')).toBe(true);
		// a statement, not a block; a block here would not establish the order
		expect(first![0]!.trimEnd().endsWith(';')).toBe(true);
	});

	it('puts ionic ahead of theme, base, components and utilities', () => {
		const names = layerStatementNames();
		expect(names).toContain('ionic');

		for (const later of ['theme', 'base', 'components', 'utilities']) {
			expect(names).toContain(later);
			expect(names.indexOf('ionic')).toBeLessThan(names.indexOf(later));
		}
	});
});

describe('ionic role variables stay unlayered', () => {
	it('declares no --ion- custom property inside any @layer block', () => {
		const blocks = layerBlocks();
		expect(blocks.length).toBeGreaterThan(0);

		for (const block of blocks) {
			// a layered --ion- DECLARATION loses to @ionic/core's unlayered :root, which is the
			// cascade bug; reading one through var() inside a layer is fine and expected
			expect(block.body, `@layer ${block.name} must not declare --ion- properties`).not.toMatch(
				/--ion-[\w-]*\s*:/
			);
		}
	});

	it('uses the doubled :root:root selector everywhere, never a bare :root', () => {
		const selectors = [...SOURCE.matchAll(/:root[^\s{,]*/g)].map((match) => match[0]!);
		expect(selectors.length).toBeGreaterThan(0);

		for (const selector of selectors) {
			expect(selector.startsWith(':root:root')).toBe(true);
		}
	});

	it('carries both theme variants at the same doubled specificity', () => {
		expect(SOURCE).toMatch(/:root:root\.light\s*\{/);
		expect(SOURCE).toMatch(/:root:root\.dark\s*\{/);
	});

	it('declares the ionic primary role on the doubled selector', () => {
		expect(declaration('ion-color-primary')).toBe(BRAND_HEX);
	});
});

describe('ramp completeness', () => {
	for (const family of RAMPS) {
		it(`declares all 11 shades of --color-${family}-`, () => {
			for (const shade of SHADES) {
				expect(declaration(`color-${family}-${shade}`)).toBeTruthy();
			}
		});
	}

	it('aliases every --color-gray- shade onto the matching ink shade', () => {
		for (const shade of SHADES) {
			expect(declaration(`color-gray-${shade}`)).toBe(`var(--color-ink-${shade})`);
		}
	});
});

describe('ink ramp', () => {
	it('holds one constant chroma across all 11 shades', () => {
		const chromas = ramp('ink').map((shade) => shade.c);
		expect(new Set(chromas).size).toBe(1);
	});

	it('decreases in lightness strictly from 50 to 950', () => {
		const lightness = ramp('ink').map((shade) => shade.l);

		for (let i = 1; i < lightness.length; i++) {
			expect(lightness[i]!).toBeLessThan(lightness[i - 1]!);
		}
	});
});

describe('brand anchor', () => {
	it('pins --color-brand-500 to the ionic primary hex', () => {
		const anchor = hexToOklch(BRAND_HEX);
		const brand500 = parseOklch(declaration('color-brand-500')!)!;

		expect(Math.abs(brand500.l - anchor.l)).toBeLessThan(0.002);
		expect(Math.abs(brand500.c - anchor.c)).toBeLessThan(0.002);
		expect(Math.abs(brand500.h - anchor.h)).toBeLessThan(0.5);
	});
});

describe('reduced-motion killswitch', () => {
	it('lives in @layer theme', () => {
		const theme = layerBlocks().filter((block) => block.name === 'theme');
		expect(theme.length).toBeGreaterThan(0);

		const body = theme.map((block) => block.body).join('\n');
		expect(body).toMatch(/html\.animations-disabled/);
		expect(body).toMatch(/prefers-reduced-motion:\s*reduce/);
		expect(body).toMatch(/animation-duration:\s*0\.001ms\s*!important/);
	});

	it('sits in a layer earlier than base, because !important reverses layer order', () => {
		const names = layerStatementNames();
		expect(names.indexOf('theme')).toBeGreaterThanOrEqual(0);
		expect(names.indexOf('theme')).toBeLessThan(names.indexOf('base'));
	});

	it('keeps the killswitch out of the later layers it has to beat', () => {
		for (const block of layerBlocks()) {
			if (block.name === 'theme') continue;
			expect(block.body).not.toMatch(/animations-disabled/);
		}
	});
});

describe('spacing token names cannot collide with component class names', () => {
	// a --spacing-X key makes `m-X`, `p-X`, `w-X` ... real utilities. `--spacing-card` therefore
	// turned the `.m-card` COMPONENT class into a margin utility, and utilities outrank
	// components, so every surface silently gained a 16px margin and overflowed its container
	const SPACING_PREFIXES = [
		'm',
		'p',
		'mx',
		'my',
		'px',
		'py',
		'gap',
		'w',
		'h',
		'size',
		'inset',
		'top',
		'right',
		'bottom',
		'left'
	];

	it('declares no --spacing-* key that any component class resolves to', () => {
		const spacingKeys = [...SOURCE.matchAll(/--spacing-([\w-]+)\s*:/g)].map((m) => m[1]!);
		expect(spacingKeys.length).toBeGreaterThan(0);

		const componentClasses = new Set(
			[...SOURCE.matchAll(/^\s*\.([a-z][\w-]*)[\s,{]/gm)].map((m) => m[1]!)
		);

		const collisions: string[] = [];
		for (const key of spacingKeys) {
			for (const prefix of SPACING_PREFIXES) {
				const utility = `${prefix}-${key}`;
				if (componentClasses.has(utility)) {
					collisions.push(`--spacing-${key} makes .${utility} a utility that outranks it`);
				}
			}
		}

		expect(collisions).toEqual([]);
	});
});
