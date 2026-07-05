#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { semverToVersionCode, setAndroidVersions, setIosVersions } from '../src/utils/version';

// package.json is the single source of truth; native files are derived
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version: string = pkg.version;

// build number: BUILD env override for resubmits, else derived from semver
const build = process.env.BUILD ? Number(process.env.BUILD) : semverToVersionCode(version);
if (!Number.isFinite(build) || build <= 0)
	throw new Error(`invalid BUILD value: "${process.env.BUILD}"`);

const iosPath = join(root, 'ios/App/App.xcodeproj/project.pbxproj');
const androidPath = join(root, 'android/app/build.gradle');

const ios = readFileSync(iosPath, 'utf8');
const nextIos = setIosVersions(ios, version, build);
if (nextIos !== ios) writeFileSync(iosPath, nextIos);

const android = readFileSync(androidPath, 'utf8');
const nextAndroid = setAndroidVersions(android, version, build);
if (nextAndroid !== android) writeFileSync(androidPath, nextAndroid);

console.log(`synced version ${version} (build ${build})`);
console.log(
	`  ios      MARKETING_VERSION=${version} CURRENT_PROJECT_VERSION=${build}${nextIos === ios ? ' (unchanged)' : ''}`
);
console.log(
	`  android  versionName=${version} versionCode=${build}${nextAndroid === android ? ' (unchanged)' : ''}`
);
