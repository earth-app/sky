import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import piexif from 'piexifjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { injectMissingExif, injectMissingExifWithDiagnostics } from '~/utils/exif';

// all fixtures derive from the real photo at tests/unit/resources/image.jpg (Canon EOS 6D,
// full camera EXIF, no GPS, no Orientation) so the parser runs against genuine device metadata
const IMAGE_PATH = resolve(process.cwd(), 'tests/unit/resources/image.jpg');

let realJpeg: string;
let bareJpeg: string;

beforeAll(() => {
	const bytes = readFileSync(IMAGE_PATH);
	realJpeg = `data:image/jpeg;base64,${bytes.toString('base64')}`;
	// strip every EXIF segment so the injector has to synthesize all required fields
	bareJpeg = piexif.remove(realJpeg);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/** build a JPEG data URL carrying only the supplied IFD tags (on top of the bare image) */
function withExif(dict: {
	'0th'?: Record<number, unknown>;
	Exif?: Record<number, unknown>;
	GPS?: Record<number, unknown>;
}): string {
	const full = { '0th': dict['0th'] ?? {}, Exif: dict.Exif ?? {}, GPS: dict.GPS ?? {}, '1st': {} };
	return piexif.insert(piexif.dump(full as piexif.ExifDict), bareJpeg);
}

type Ifd = Record<number, unknown>;
// piexif types every IFD as optional; normalize to always-present records so the
// assertions below can index tags without strict-null noise
function reload(dataUrl: string): { '0th': Ifd; Exif: Ifd; GPS: Ifd } {
	const d = piexif.load(dataUrl);
	return { '0th': d['0th'] ?? {}, Exif: d.Exif ?? {}, GPS: d.GPS ?? {} };
}

describe('injectMissingExif — non-JPEG input', () => {
	it('returns PNG data URLs untouched with empty diagnostics', async () => {
		const png =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
		const { dataUrl, diagnostics } = await injectMissingExifWithDiagnostics(png);
		expect(dataUrl).toBe(png);
		expect(diagnostics.hadExif).toBe(false);
		expect(Object.values(diagnostics.injected).every((v) => v === false)).toBe(true);
	});

	it('injectMissingExif (thin wrapper) also returns non-JPEG unchanged', async () => {
		const txt = 'data:text/plain;base64,aGVsbG8=';
		expect(await injectMissingExif(txt)).toBe(txt);
	});
});

describe('injectMissingExif — preserving real device EXIF', () => {
	// expectations are derived from whatever the source image actually carries, so this
	// survives swapping tests/unit/resources/image.jpg for a different real photo
	it('keeps every tag the image already carries and never re-synthesizes a present field', async () => {
		const before = reload(realJpeg);
		const { dataUrl, diagnostics } = await injectMissingExifWithDiagnostics(realJpeg);

		expect(diagnostics.hadExif).toBe(true);

		const after = reload(dataUrl);
		// structural IFD-pointer offsets are recomputed by piexif on re-dump, so they're
		// not content and can't be compared byte-for-byte
		const POINTER_TAGS = new Set<number>([
			piexif.ImageIFD.ExifTag,
			piexif.ImageIFD.GPSTag,
			piexif.ExifIFD.InteroperabilityTag
		]);
		// any real 0th / Exif tag present on the source must come back byte-for-byte
		for (const tag of Object.keys(before['0th'])) {
			if (POINTER_TAGS.has(Number(tag))) continue;
			expect(after['0th'][Number(tag)]).toEqual(before['0th'][Number(tag)]);
		}
		for (const tag of Object.keys(before.Exif)) {
			if (POINTER_TAGS.has(Number(tag))) continue;
			expect(after.Exif[Number(tag)]).toEqual(before.Exif[Number(tag)]);
		}

		// a field the source already has is never flagged as injected
		if (before['0th'][piexif.ImageIFD.Make] !== undefined)
			expect(diagnostics.injected.make).toBe(false);
		if (before['0th'][piexif.ImageIFD.Orientation] !== undefined)
			expect(diagnostics.injected.orientation).toBe(false);
		if (before.Exif[piexif.ExifIFD.DateTimeOriginal] !== undefined)
			expect(diagnostics.injected.dateTimeOriginal).toBe(false);
		// this photo has full camera EXIF (FNumber/FocalLength), so no defaults are added
		expect(diagnostics.injected.cameraProps).toBe(false);
	});
});

describe('injectMissingExif — full synthesis on a stripped image', () => {
	it('fills every required field when the image has no EXIF', async () => {
		vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
		const { dataUrl, diagnostics } = await injectMissingExifWithDiagnostics(bareJpeg);

		expect(diagnostics.hadExif).toBe(false);
		expect(diagnostics.injected.make).toBe(true);
		expect(diagnostics.injected.model).toBe(true);
		expect(diagnostics.injected.software).toBe(true);
		expect(diagnostics.injected.dateTimeOriginal).toBe(true);
		expect(diagnostics.injected.dateTimeDigitized).toBe(true);
		expect(diagnostics.injected.cameraProps).toBe(true);
		expect(diagnostics.injected.orientation).toBe(true);
		expect(diagnostics.injected.gps).toBe(false);

		const out = reload(dataUrl);
		// plausible mobile-camera defaults
		expect(out.Exif[piexif.ExifIFD.FNumber]).toEqual([28, 10]);
		expect(out.Exif[piexif.ExifIFD.ExposureTime]).toEqual([1, 60]);
		expect(out.Exif[piexif.ExifIFD.FocalLength]).toEqual([40, 10]);
		expect(out.Exif[piexif.ExifIFD.LensModel]).toBe('Built-in Camera');
		expect(out.Exif[piexif.ExifIFD.ColorSpace]).toBe(1);
		expect(out['0th'][piexif.ImageIFD.XResolution]).toEqual([72, 1]);
		expect(out['0th'][piexif.ImageIFD.ResolutionUnit]).toBe(2);
		// DateTimeDigitized mirrors DateTimeOriginal
		expect(out.Exif[piexif.ExifIFD.DateTimeDigitized]).toBe(
			out.Exif[piexif.ExifIFD.DateTimeOriginal]
		);
	});

	it('treats whitespace-only tags as absent and overwrites them', async () => {
		vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
		const fixture = withExif({ '0th': { [piexif.ImageIFD.Make]: '   ' } });
		const { dataUrl, diagnostics } = await injectMissingExifWithDiagnostics(fixture);
		expect(diagnostics.injected.make).toBe(true);
		expect(reload(dataUrl)['0th'][piexif.ImageIFD.Make]).toBe('Linux');
	});
});

describe('formatExifDate', () => {
	it('formats the current time as zero-padded UTC YYYY:MM:DD HH:MM:SS', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.UTC(2023, 0, 5, 9, 7, 3)));
		vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });

		const { dataUrl } = await injectMissingExifWithDiagnostics(bareJpeg);
		expect(reload(dataUrl).Exif[piexif.ExifIFD.DateTimeOriginal]).toBe('2023:01:05 09:07:03');
	});

	it('produces a validator-parseable pattern', async () => {
		vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
		const { dataUrl } = await injectMissingExifWithDiagnostics(bareJpeg);
		expect(reload(dataUrl).Exif[piexif.ExifIFD.DateTimeOriginal]).toMatch(
			/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/
		);
	});
});

describe('decimalToDms (via GPS injection)', () => {
	it('converts a decimal degree into [deg,min,sec] rationals', async () => {
		const { dataUrl } = await injectMissingExifWithDiagnostics(bareJpeg, {
			location: { latitude: 40.7128, longitude: -74.006 }
		});
		const gps = reload(dataUrl).GPS;
		// 40.7128 -> 40deg, 42min, 4608/100 sec
		expect(gps[piexif.GPSIFD.GPSLatitude]).toEqual([
			[40, 1],
			[42, 1],
			[4608, 100]
		]);
	});
});

describe('GPS injection', () => {
	it('writes N/E refs and altitude for positive coordinates', async () => {
		const { dataUrl, diagnostics } = await injectMissingExifWithDiagnostics(bareJpeg, {
			location: { latitude: 40.7128, longitude: 74.006, altitude: 10 }
		});
		expect(diagnostics.injected.gps).toBe(true);
		const gps = reload(dataUrl).GPS;
		expect(gps[piexif.GPSIFD.GPSLatitudeRef]).toBe('N');
		expect(gps[piexif.GPSIFD.GPSLongitudeRef]).toBe('E');
		expect(gps[piexif.GPSIFD.GPSAltitudeRef]).toBe(0);
		expect(gps[piexif.GPSIFD.GPSAltitude]).toEqual([1000, 100]);
	});

	it('writes S/W refs for negative coordinates and ref 1 for negative altitude', async () => {
		const { dataUrl } = await injectMissingExifWithDiagnostics(bareJpeg, {
			location: { latitude: -33.8688, longitude: -151.2093, altitude: -5 }
		});
		const gps = reload(dataUrl).GPS;
		expect(gps[piexif.GPSIFD.GPSLatitudeRef]).toBe('S');
		expect(gps[piexif.GPSIFD.GPSLongitudeRef]).toBe('W');
		expect(gps[piexif.GPSIFD.GPSAltitudeRef]).toBe(1);
	});

	it('omits altitude tags when altitude is not provided', async () => {
		const { dataUrl } = await injectMissingExifWithDiagnostics(bareJpeg, {
			location: { latitude: 1, longitude: 2 }
		});
		const gps = reload(dataUrl).GPS;
		expect(gps[piexif.GPSIFD.GPSAltitude]).toBeUndefined();
	});

	it('skips GPS when coordinates are not finite', async () => {
		const { dataUrl, diagnostics } = await injectMissingExifWithDiagnostics(bareJpeg, {
			location: { latitude: Number.NaN, longitude: 2 }
		});
		expect(diagnostics.injected.gps).toBe(false);
		expect(reload(dataUrl).GPS[piexif.GPSIFD.GPSLatitude]).toBeUndefined();
	});

	it('does not overwrite GPS coordinates already present on the image', async () => {
		const fixture = withExif({
			GPS: {
				[piexif.GPSIFD.GPSLatitudeRef]: 'N',
				[piexif.GPSIFD.GPSLatitude]: [
					[10, 1],
					[0, 1],
					[0, 100]
				],
				[piexif.GPSIFD.GPSLongitudeRef]: 'E',
				[piexif.GPSIFD.GPSLongitude]: [
					[20, 1],
					[0, 1],
					[0, 100]
				]
			}
		});
		const { dataUrl, diagnostics } = await injectMissingExifWithDiagnostics(fixture, {
			location: { latitude: 40.7128, longitude: -74.006 }
		});
		expect(diagnostics.injected.gps).toBe(false);
		expect(reload(dataUrl).GPS[piexif.GPSIFD.GPSLatitude]).toEqual([
			[10, 1],
			[0, 1],
			[0, 100]
		]);
	});
});

describe('detectDeviceFromUserAgent (via Make/Model backfill)', () => {
	const cases: Array<[string, string, string | null]> = [
		['iOS iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X)', 'Apple'],
		['Samsung', 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit', 'Samsung'],
		['Google Pixel', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit', 'Google'],
		['OnePlus', 'Mozilla/5.0 (Linux; Android 13; ONEPLUS A6013) AppleWebKit', 'OnePlus'],
		['Huawei', 'Mozilla/5.0 (Linux; Android 10; HUAWEI VOG-L29) AppleWebKit', 'Huawei'],
		['Xiaomi Redmi', 'Mozilla/5.0 (Linux; Android 12; Redmi Note 10) AppleWebKit', 'Xiaomi'],
		['LG', 'Mozilla/5.0 (Linux; Android 9; LG-H870) AppleWebKit', 'LG'],
		['Motorola', 'Mozilla/5.0 (Linux; Android 11; Motorola Edge) AppleWebKit', 'Motorola'],
		['Sony Xperia', 'Mozilla/5.0 (Linux; Android 10; Xperia 1 II) AppleWebKit', 'Sony'],
		['Nokia', 'Mozilla/5.0 (Linux; Android 10; Nokia 7.2) AppleWebKit', 'Nokia'],
		['generic Android', 'Mozilla/5.0 (Linux; Android 10; Generic One) AppleWebKit', 'Android'],
		['macOS', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Apple'],
		['Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Microsoft'],
		['Linux desktop', 'Mozilla/5.0 (X11; Linux x86_64)', 'Linux'],
		['unknown UA', 'SomeRandomCrawler/2.0', 'Unknown']
	];

	it.each(cases)('%s -> Make %s', async (_label, ua, expectedMake) => {
		vi.stubGlobal('navigator', { userAgent: ua });
		const { dataUrl } = await injectMissingExifWithDiagnostics(bareJpeg);
		expect(reload(dataUrl)['0th'][piexif.ImageIFD.Make]).toBe(expectedMake);
	});

	it('falls back to Unknown when navigator is undefined', async () => {
		vi.stubGlobal('navigator', undefined);
		const { dataUrl } = await injectMissingExifWithDiagnostics(bareJpeg);
		const out = reload(dataUrl);
		expect(out['0th'][piexif.ImageIFD.Make]).toBe('Unknown');
		expect(out['0th'][piexif.ImageIFD.Model]).toBe('Unknown');
	});
});

describe('resolveDevice — explicit overrides', () => {
	it('uses provided make + model verbatim and ignores the user agent', async () => {
		vi.stubGlobal('navigator', {
			userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X)'
		});
		const { dataUrl } = await injectMissingExifWithDiagnostics(bareJpeg, {
			make: 'Acme',
			model: 'Rocket'
		});
		const out = reload(dataUrl);
		expect(out['0th'][piexif.ImageIFD.Make]).toBe('Acme');
		expect(out['0th'][piexif.ImageIFD.Model]).toBe('Rocket');
	});

	it('detects model from the UA when only make is supplied', async () => {
		vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
		const { dataUrl } = await injectMissingExifWithDiagnostics(bareJpeg, { make: 'Acme' });
		const out = reload(dataUrl);
		expect(out['0th'][piexif.ImageIFD.Make]).toBe('Acme');
		expect(out['0th'][piexif.ImageIFD.Model]).toBe('PC');
	});
});

describe('buildSoftwareTag', () => {
	const read = async (opts: Parameters<typeof injectMissingExif>[1]) => {
		vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
		const { dataUrl } = await injectMissingExifWithDiagnostics(bareJpeg, opts);
		return reload(dataUrl)['0th'][piexif.ImageIFD.Software];
	};

	it('uses the explicit OS version when given', async () => {
		expect(await read({ osVersion: '17.4.1' })).toBe('17.4.1');
	});
	it('maps platform ios -> iOS', async () => {
		expect(await read({ platform: 'ios' })).toBe('iOS');
	});
	it('maps platform android -> Android', async () => {
		expect(await read({ platform: 'android' })).toBe('Android');
	});
	it('falls back to Earth App for web / unknown platforms', async () => {
		expect(await read({ platform: 'web' })).toBe('Earth App');
		expect(await read({})).toBe('Earth App');
	});
});

describe('screenOrientationToExif', () => {
	const readOrientation = async () => {
		vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
		const { dataUrl } = await injectMissingExifWithDiagnostics(bareJpeg);
		return reload(dataUrl)['0th'][piexif.ImageIFD.Orientation];
	};

	it.each([
		[90, 6],
		[180, 3],
		[270, 8],
		[0, 1],
		[45, 1]
	])('angle %i -> orientation %i', async (angle, expected) => {
		vi.stubGlobal('screen', { orientation: { angle } });
		expect(await readOrientation()).toBe(expected);
	});

	it('defaults to 1 when screen is undefined', async () => {
		vi.stubGlobal('screen', undefined);
		expect(await readOrientation()).toBe(1);
	});

	it('defaults to 1 when screen has no orientation', async () => {
		vi.stubGlobal('screen', {});
		expect(await readOrientation()).toBe(1);
	});

	it('preserves an Orientation the image already carries', async () => {
		vi.stubGlobal('screen', { orientation: { angle: 90 } });
		const fixture = withExif({ '0th': { [piexif.ImageIFD.Orientation]: 3 } });
		const { dataUrl, diagnostics } = await injectMissingExifWithDiagnostics(fixture);
		expect(diagnostics.injected.orientation).toBe(false);
		expect(reload(dataUrl)['0th'][piexif.ImageIFD.Orientation]).toBe(3);
	});
});

describe('camera property backfill', () => {
	it('repairs a zero FocalLength while leaving other props alone', async () => {
		const fixture = withExif({ Exif: { [piexif.ExifIFD.FocalLength]: [0, 1] } });
		const { dataUrl, diagnostics } = await injectMissingExifWithDiagnostics(fixture);
		expect(diagnostics.injected.cameraProps).toBe(true);
		expect(reload(dataUrl).Exif[piexif.ExifIFD.FocalLength]).toEqual([40, 10]);
	});

	it('repairs a zero-denominator FocalLength', async () => {
		const fixture = withExif({ Exif: { [piexif.ExifIFD.FocalLength]: [40, 0] } });
		const { dataUrl, diagnostics } = await injectMissingExifWithDiagnostics(fixture);
		expect(diagnostics.injected.cameraProps).toBe(true);
		expect(reload(dataUrl).Exif[piexif.ExifIFD.FocalLength]).toEqual([40, 10]);
	});

	it('keeps a valid FocalLength and does not add default props', async () => {
		const fixture = withExif({ Exif: { [piexif.ExifIFD.FocalLength]: [50, 1] } });
		const { dataUrl, diagnostics } = await injectMissingExifWithDiagnostics(fixture);
		expect(diagnostics.injected.cameraProps).toBe(false);
		const out = reload(dataUrl);
		expect(out.Exif[piexif.ExifIFD.FocalLength]).toEqual([50, 1]);
		expect(out.Exif[piexif.ExifIFD.LensModel]).toBeUndefined();
	});

	it('repairs a scalar (non-rational) zero FocalLength', async () => {
		const fixture = withExif({ Exif: { [piexif.ExifIFD.FocalLength]: 0 } });
		const { dataUrl, diagnostics } = await injectMissingExifWithDiagnostics(fixture);
		expect(diagnostics.injected.cameraProps).toBe(true);
		expect(reload(dataUrl).Exif[piexif.ExifIFD.FocalLength]).toEqual([40, 10]);
	});

	it('accepts FNumber alone as a sufficient camera property', async () => {
		const fixture = withExif({ Exif: { [piexif.ExifIFD.FNumber]: [18, 10] } });
		const { dataUrl, diagnostics } = await injectMissingExifWithDiagnostics(fixture);
		expect(diagnostics.injected.cameraProps).toBe(false);
		const out = reload(dataUrl);
		expect(out.Exif[piexif.ExifIFD.FNumber]).toEqual([18, 10]);
		expect(out.Exif[piexif.ExifIFD.FocalLength]).toBeUndefined();
	});
});

describe('failure paths', () => {
	it('returns the original data URL when piexif.dump throws', async () => {
		vi.spyOn(piexif, 'dump').mockImplementation(() => {
			throw new Error('bad tag');
		});
		const { dataUrl } = await injectMissingExifWithDiagnostics(bareJpeg);
		expect(dataUrl).toBe(bareJpeg);
	});

	it('treats a corrupt EXIF header as empty (loadExifSafe swallows the throw)', async () => {
		vi.spyOn(piexif, 'load').mockImplementation(() => {
			throw new Error('corrupt');
		});
		vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
		const { diagnostics } = await injectMissingExifWithDiagnostics(bareJpeg);
		// no existing EXIF could be read, so everything is synthesized
		expect(diagnostics.hadExif).toBe(false);
		expect(diagnostics.injected.make).toBe(true);
	});
});
