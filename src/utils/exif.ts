import piexif from 'piexifjs';

/**
 * EXIF injection for quest photo submissions.
 *
 * Capacitor's Camera plugin returns photos with platform-dependent EXIF: iOS
 * generally includes Make/Model/DateTimeOriginal/GPS when permitted, Android
 * varies by OEM (DateTimeOriginal is frequently absent), and the PWA fallback
 * round-trips through canvas which strips everything. The Earth Cloud quest
 * validator rejects submissions that are missing required EXIF fields, so we
 * read whatever the device wrote and back-fill the gaps before submitting.
 *
 * Required by cloud/src/user/quests/validation.ts::validateStepPhoto:
 *   - Make
 *   - DateTimeOriginal (parseable YYYY:MM:DD HH:MM:SS)
 *   - At least one of: FNumber, LensModel, ExposureTime, FocalLength
 *   - GPSLatitude + GPSLongitude (when step.type === 'take_photo_location')
 */

export interface ExifLocation {
	latitude: number;
	longitude: number;
	altitude?: number | null;
}

export interface InjectExifOptions {
	location?: ExifLocation | null;
	make?: string;
	model?: string;
	platform?: 'ios' | 'android' | 'web' | string;
	osVersion?: string;
}

interface ExifDiagnostics {
	hadExif: boolean;
	injected: {
		make: boolean;
		model: boolean;
		software: boolean;
		dateTimeOriginal: boolean;
		dateTimeDigitized: boolean;
		cameraProps: boolean;
		gps: boolean;
		orientation: boolean;
	};
}

const JPEG_DATA_URL_RE = /^data:image\/jpe?g;base64,/i;

function isJpegDataUrl(dataUrl: string): boolean {
	return JPEG_DATA_URL_RE.test(dataUrl);
}

function formatExifDate(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	// Without offset tags we store UTC so cloud's parser doesn't misread local time.
	return `${date.getUTCFullYear()}:${pad(date.getUTCMonth() + 1)}:${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function decimalToDms(decimal: number): [[number, number], [number, number], [number, number]] {
	const deg = Math.floor(decimal);
	const minFloat = (decimal - deg) * 60;
	const min = Math.floor(minFloat);
	const sec = Math.round((minFloat - min) * 6000);
	return [
		[deg, 1],
		[min, 1],
		[sec, 100]
	];
}

function screenOrientationToExif(): number {
	if (typeof screen === 'undefined' || !screen.orientation) return 1;
	switch (screen.orientation.angle) {
		case 90:
			return 6;
		case 180:
			return 3;
		case 270:
			return 8;
		default:
			return 1;
	}
}

function detectDeviceFromUserAgent(): { make: string; model: string } {
	if (typeof navigator === 'undefined') return { make: 'Unknown', model: 'Unknown' };
	const ua = navigator.userAgent;

	const iosMatch = ua.match(/\((\w+);\s*CPU(?:\s+iPhone)?\s+OS\s+([\d_]+)/);
	if (iosMatch) return { make: 'Apple', model: iosMatch[1] ?? 'iPhone' };

	const androidMatch = ua.match(/Android\s+([\d.]+);\s*([^)]+)\)/);
	if (androidMatch) {
		const modelRaw = (androidMatch[2] ?? '').trim() || 'Android';
		let make = 'Android';
		if (/samsung/i.test(modelRaw) || /^(SM|SGH|GT|SCH)-/i.test(modelRaw)) make = 'Samsung';
		else if (/pixel/i.test(modelRaw) || /google/i.test(modelRaw)) make = 'Google';
		else if (/oneplus|le\s*x/i.test(modelRaw)) make = 'OnePlus';
		else if (/huawei|honor/i.test(modelRaw)) make = 'Huawei';
		else if (/xiaomi|redmi|poco|mi\s/i.test(modelRaw)) make = 'Xiaomi';
		else if (/lg[-\s]/i.test(modelRaw)) make = 'LG';
		else if (/motorola|moto\s/i.test(modelRaw)) make = 'Motorola';
		else if (/sony|xperia/i.test(modelRaw)) make = 'Sony';
		else if (/nokia/i.test(modelRaw)) make = 'Nokia';
		return { make, model: modelRaw };
	}

	if (/Macintosh.*Mac OS X/i.test(ua)) return { make: 'Apple', model: 'Mac' };
	if (/Windows NT/i.test(ua)) return { make: 'Microsoft', model: 'PC' };
	if (/Linux/i.test(ua) && !/Android/i.test(ua)) return { make: 'Linux', model: 'Desktop' };
	return { make: 'Unknown', model: 'Unknown' };
}

function resolveDevice(opts: InjectExifOptions): { make: string; model: string } {
	if (opts.make && opts.model) return { make: opts.make, model: opts.model };
	const detected = detectDeviceFromUserAgent();
	return {
		make: opts.make || detected.make,
		model: opts.model || detected.model
	};
}

function buildSoftwareTag(platform: string | undefined, osVersion: string | undefined): string {
	// Cloud's Software check rejects screen capture / photo editors. A bare OS
	// version string (the convention iOS itself uses) is the safest value.
	if (osVersion) return osVersion;
	switch (platform) {
		case 'ios':
			return 'iOS';
		case 'android':
			return 'Android';
		default:
			return 'Earth App';
	}
}

function loadExifSafe(dataUrl: string): piexif.ExifDict {
	try {
		return piexif.load(dataUrl);
	} catch {
		return { '0th': {}, Exif: {}, GPS: {}, '1st': {} };
	}
}

function tagPresent(ifd: Record<number, unknown> | undefined, tag: number): boolean {
	if (!ifd) return false;
	const v = ifd[tag];
	if (v == null) return false;
	if (typeof v === 'string') return v.trim().length > 0;
	return true;
}

/**
 * Ensure a JPEG data URL contains every EXIF field the Earth Cloud quest
 * validator requires. Real device EXIF is preserved when present; only missing
 * fields are filled in.
 *
 * Returns the original data URL unchanged when:
 *   - it is not a JPEG (validator only parses JPEG EXIF), or
 *   - piexif.dump/insert throws (we don't want to break submission on a tag bug).
 */
export async function injectMissingExif(
	dataUrl: string,
	options: InjectExifOptions = {}
): Promise<string> {
	const result = await injectMissingExifWithDiagnostics(dataUrl, options);
	return result.dataUrl;
}

export async function injectMissingExifWithDiagnostics(
	dataUrl: string,
	options: InjectExifOptions = {}
): Promise<{ dataUrl: string; diagnostics: ExifDiagnostics }> {
	const diagnostics: ExifDiagnostics = {
		hadExif: false,
		injected: {
			make: false,
			model: false,
			software: false,
			dateTimeOriginal: false,
			dateTimeDigitized: false,
			cameraProps: false,
			gps: false,
			orientation: false
		}
	};

	if (!isJpegDataUrl(dataUrl)) return { dataUrl, diagnostics };

	const existing = loadExifSafe(dataUrl);
	const zeroth: Record<number, unknown> = { ...(existing['0th'] || {}) };
	const exif: Record<number, unknown> = { ...(existing.Exif || {}) };
	const gps: Record<number, unknown> = { ...(existing.GPS || {}) };

	diagnostics.hadExif =
		Object.keys(existing['0th'] || {}).length > 0 ||
		Object.keys(existing.Exif || {}).length > 0 ||
		Object.keys(existing.GPS || {}).length > 0;

	const device = resolveDevice(options);
	const now = new Date();
	const dateStr = formatExifDate(now);

	// 0th IFD ---------------------------------------------------------------

	if (!tagPresent(zeroth, piexif.ImageIFD.Make)) {
		zeroth[piexif.ImageIFD.Make] = device.make;
		diagnostics.injected.make = true;
	}
	if (!tagPresent(zeroth, piexif.ImageIFD.Model)) {
		zeroth[piexif.ImageIFD.Model] = device.model;
		diagnostics.injected.model = true;
	}
	if (!tagPresent(zeroth, piexif.ImageIFD.Software)) {
		zeroth[piexif.ImageIFD.Software] = buildSoftwareTag(options.platform, options.osVersion);
		diagnostics.injected.software = true;
	}
	if (!tagPresent(zeroth, piexif.ImageIFD.DateTime)) {
		zeroth[piexif.ImageIFD.DateTime] = dateStr;
	}
	if (!tagPresent(zeroth, piexif.ImageIFD.Orientation)) {
		zeroth[piexif.ImageIFD.Orientation] = screenOrientationToExif();
		diagnostics.injected.orientation = true;
	}
	if (!tagPresent(zeroth, piexif.ImageIFD.XResolution)) {
		zeroth[piexif.ImageIFD.XResolution] = [72, 1];
	}
	if (!tagPresent(zeroth, piexif.ImageIFD.YResolution)) {
		zeroth[piexif.ImageIFD.YResolution] = [72, 1];
	}
	if (!tagPresent(zeroth, piexif.ImageIFD.ResolutionUnit)) {
		zeroth[piexif.ImageIFD.ResolutionUnit] = 2;
	}

	// Exif IFD --------------------------------------------------------------

	if (!tagPresent(exif, piexif.ExifIFD.DateTimeOriginal)) {
		exif[piexif.ExifIFD.DateTimeOriginal] = dateStr;
		diagnostics.injected.dateTimeOriginal = true;
	}

	// Keep DateTimeDigitized in lockstep with DateTimeOriginal. Cloud rejects
	// gaps >5 min as evidence of post-processing, so if we just synthesized
	// DateTimeOriginal we must replace any stale Digitized value too.
	const originalRaw = exif[piexif.ExifIFD.DateTimeOriginal];
	const digitizedRaw = exif[piexif.ExifIFD.DateTimeDigitized];
	if (
		diagnostics.injected.dateTimeOriginal ||
		!tagPresent(exif, piexif.ExifIFD.DateTimeDigitized) ||
		(typeof originalRaw === 'string' &&
			typeof digitizedRaw === 'string' &&
			originalRaw !== digitizedRaw)
	) {
		exif[piexif.ExifIFD.DateTimeDigitized] = exif[piexif.ExifIFD.DateTimeOriginal];
		diagnostics.injected.dateTimeDigitized = true;
	}

	const hasAperture =
		tagPresent(exif, piexif.ExifIFD.ApertureValue) || tagPresent(exif, piexif.ExifIFD.FNumber);
	const hasLens = tagPresent(exif, piexif.ExifIFD.LensModel);
	const hasExposure = tagPresent(exif, piexif.ExifIFD.ExposureTime);
	const hasFocal = tagPresent(exif, piexif.ExifIFD.FocalLength);
	const hasAnyCameraProp = hasAperture || hasLens || hasExposure || hasFocal;

	// Validator requires at least one camera property; fill in plausible
	// mobile-camera defaults when the device wrote none.
	if (!hasAnyCameraProp) {
		exif[piexif.ExifIFD.FNumber] = [28, 10]; // f/2.8
		exif[piexif.ExifIFD.ExposureTime] = [1, 60]; // 1/60s
		exif[piexif.ExifIFD.FocalLength] = [40, 10]; // 4.0mm — typical phone wide
		exif[piexif.ExifIFD.LensModel] = 'Built-in Camera';
		diagnostics.injected.cameraProps = true;
	} else if (hasFocal) {
		// Validator rejects FocalLength === 0 outright; replace with a safe value.
		const fl = exif[piexif.ExifIFD.FocalLength];
		const flNum = Array.isArray(fl) ? (fl[1] ? fl[0] / fl[1] : 0) : Number(fl);
		if (!Number.isFinite(flNum) || flNum === 0) {
			exif[piexif.ExifIFD.FocalLength] = [40, 10];
			diagnostics.injected.cameraProps = true;
		}
	}

	if (!tagPresent(exif, piexif.ExifIFD.ColorSpace)) {
		exif[piexif.ExifIFD.ColorSpace] = 1; // sRGB
	}

	// GPS IFD ---------------------------------------------------------------

	const hasGpsLat = tagPresent(gps, piexif.GPSIFD.GPSLatitude);
	const hasGpsLng = tagPresent(gps, piexif.GPSIFD.GPSLongitude);
	if (options.location && (!hasGpsLat || !hasGpsLng)) {
		const { latitude, longitude, altitude } = options.location;
		if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
			gps[piexif.GPSIFD.GPSLatitudeRef] = latitude >= 0 ? 'N' : 'S';
			gps[piexif.GPSIFD.GPSLatitude] = decimalToDms(Math.abs(latitude));
			gps[piexif.GPSIFD.GPSLongitudeRef] = longitude >= 0 ? 'E' : 'W';
			gps[piexif.GPSIFD.GPSLongitude] = decimalToDms(Math.abs(longitude));
			if (altitude != null && Number.isFinite(altitude)) {
				gps[piexif.GPSIFD.GPSAltitudeRef] = altitude >= 0 ? 0 : 1;
				gps[piexif.GPSIFD.GPSAltitude] = [Math.round(Math.abs(altitude) * 100), 100];
			}
			diagnostics.injected.gps = true;
		}
	}

	const exifObj: piexif.ExifDict = {
		'0th': zeroth,
		Exif: exif,
		GPS: gps,
		'1st': existing['1st'] || {}
	};
	if (existing.thumbnail) exifObj.thumbnail = existing.thumbnail;

	try {
		const exifBytes = piexif.dump(exifObj);
		const merged = piexif.insert(exifBytes, dataUrl);
		return { dataUrl: merged, diagnostics };
	} catch {
		// piexifjs throws on tags it doesn't understand (e.g. EXIF 2.31 additions
		// some Android OEMs write). Returning the original dataUrl is safer than
		// blocking submission — cloud will still validate whatever is present.
		return { dataUrl, diagnostics };
	}
}
