export interface Semver {
	major: number;
	minor: number;
	patch: number;
}

/** parse a semver-ish string; drops any -prerelease/+build suffix */
export function parseSemver(version: string): Semver {
	const core = version.trim().split(/[-+]/)[0] ?? '';
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(core);
	if (!match) throw new Error(`invalid semver version: "${version}"`);
	return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/**
 * derive a monotonic integer build number from a semver.
 * major*10000 + minor*100 + patch (minor/patch must stay < 100).
 */
export function semverToVersionCode(version: string): number {
	const { major, minor, patch } = parseSemver(version);
	if (minor > 99 || patch > 99)
		throw new Error(`minor/patch must be < 100 to derive a versionCode: "${version}"`);
	return major * 10000 + minor * 100 + patch;
}

/** rewrite every MARKETING_VERSION / CURRENT_PROJECT_VERSION in an Xcode pbxproj */
export function setIosVersions(pbxproj: string, marketing: string, build: number): string {
	return pbxproj
		.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${marketing};`)
		.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
}

/** rewrite versionName / versionCode in an Android app build.gradle */
export function setAndroidVersions(
	gradle: string,
	versionName: string,
	versionCode: number
): string {
	return gradle
		.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`)
		.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
}
