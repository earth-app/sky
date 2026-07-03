import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
	time: string;
	level: LogLevel;
	category: string;
	message: string;
	meta?: Record<string, unknown>;
}

export interface LogFile {
	name: string;
	content: string;
	size: number;
	modified: number;
}

const MAX_BUFFER_LINES = 500;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_FILE_AGE_MS = 24 * 60 * 60 * 1000;
const FLUSH_INTERVAL_MS = 5_000;
const KEEP_FILES = 3;
const LOG_DIR = 'logs';
const FILE_PREFIX = 'app-';
const FILE_EXT = '.log';
const IDB_NAME = 'sky-logs';
const IDB_STORE = 'entries';

// shapes we never want surfaced even at debug
const SENSITIVE_PATTERNS: { re: RegExp; replace: string }[] = [
	{ re: /\bBearer\s+[A-Za-z0-9._\-+/=]+/gi, replace: 'Bearer ***' },
	{ re: /\beyJ[A-Za-z0-9._\-+/=]{8,}/g, replace: 'eyJ***' },
	{ re: /\bsk-[A-Za-z0-9_\-]{8,}/g, replace: 'sk-***' },
	{
		re: /"(password|token|session_token|api_key|apiKey|authorization|auth)"\s*:\s*"[^"]*"/gi,
		replace: '"$1":"***"'
	}
];

let buffer: LogEntry[] = [];
let currentName: string | null = null;
let currentSize = 0;
let currentStartedAt = 0;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let persistFailureLogged = false;
let inflightFlush: Promise<void> | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;
let initialized = false;

const isNative = () => Capacitor.isNativePlatform();
const isClient = () => typeof window !== 'undefined';

function sanitize(value: string): string {
	let out = value;
	for (const { re, replace } of SENSITIVE_PATTERNS) {
		out = out.replace(re, replace);
	}
	return out;
}

function safeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
	if (!meta) return undefined;
	try {
		const json = JSON.stringify(meta);
		const cleaned = sanitize(json);
		return JSON.parse(cleaned);
	} catch {
		return undefined;
	}
}

function formatLine(entry: LogEntry): string {
	const base = `[${entry.time}] [${entry.level.toUpperCase()}] [${entry.category}] ${sanitize(entry.message)}`;
	if (entry.meta && Object.keys(entry.meta).length > 0) {
		try {
			return `${base} ${sanitize(JSON.stringify(entry.meta))}\n`;
		} catch {
			return `${base}\n`;
		}
	}
	return `${base}\n`;
}

function pad(n: number, width = 2): string {
	return String(n).padStart(width, '0');
}

function fileNameForNow(d = new Date()): string {
	const y = d.getFullYear();
	const mo = pad(d.getMonth() + 1);
	const da = pad(d.getDate());
	const h = pad(d.getHours());
	const mi = pad(d.getMinutes());
	return `${FILE_PREFIX}${y}${mo}${da}-${h}${mi}${FILE_EXT}`;
}

function parseFileTimestamp(name: string): number {
	// names look like app-20260604-1432.log; fall back to 0 on parse miss so old files get purged first
	const m = name.match(/^app-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\.log$/);
	if (!m) return 0;
	const [, y, mo, d, h, mi] = m;
	return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)).getTime();
}

// indexeddb fallback used on web only
function openDb(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve, reject) => {
		const req = indexedDB.open(IDB_NAME, 1);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(IDB_STORE)) {
				db.createObjectStore(IDB_STORE, { keyPath: 'name' });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
	return dbPromise;
}

async function idbAppend(name: string, chunk: string): Promise<number> {
	const db = await openDb();
	return await new Promise<number>((resolve, reject) => {
		const tx = db.transaction(IDB_STORE, 'readwrite');
		const store = tx.objectStore(IDB_STORE);
		const getReq = store.get(name);
		getReq.onsuccess = () => {
			const existing = getReq.result as
				{ name: string; content: string; modified: number; size: number } | undefined;
			const next = existing ? existing.content + chunk : chunk;
			store.put({ name, content: next, modified: Date.now(), size: next.length });
			resolve(next.length);
		};
		getReq.onerror = () => reject(getReq.error);
	});
}

async function idbList(): Promise<LogFile[]> {
	const db = await openDb();
	return await new Promise<LogFile[]>((resolve, reject) => {
		const tx = db.transaction(IDB_STORE, 'readonly');
		const req = tx.objectStore(IDB_STORE).getAll();
		req.onsuccess = () => resolve((req.result as LogFile[]) || []);
		req.onerror = () => reject(req.error);
	});
}

async function idbDelete(name: string): Promise<void> {
	const db = await openDb();
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction(IDB_STORE, 'readwrite');
		tx.objectStore(IDB_STORE).delete(name);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

async function idbClear(): Promise<void> {
	const db = await openDb();
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction(IDB_STORE, 'readwrite');
		tx.objectStore(IDB_STORE).clear();
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

// native fs helpers
async function ensureLogDir(): Promise<void> {
	try {
		await Filesystem.stat({ path: LOG_DIR, directory: Directory.Data });
	} catch {
		try {
			await Filesystem.mkdir({ path: LOG_DIR, directory: Directory.Data, recursive: true });
		} catch {
			// ignore; write will surface real failure
		}
	}
}

async function fsAppend(name: string, chunk: string): Promise<number> {
	await ensureLogDir();
	const path = `${LOG_DIR}/${name}`;
	try {
		await Filesystem.appendFile({
			path,
			directory: Directory.Data,
			data: chunk,
			encoding: Encoding.UTF8
		});
	} catch {
		// appendFile fails when missing; write fresh
		await Filesystem.writeFile({
			path,
			directory: Directory.Data,
			data: chunk,
			encoding: Encoding.UTF8
		});
	}
	try {
		const stat = await Filesystem.stat({ path, directory: Directory.Data });
		return stat.size ?? 0;
	} catch {
		return currentSize + chunk.length;
	}
}

async function fsList(): Promise<LogFile[]> {
	await ensureLogDir();
	let names: string[] = [];
	try {
		const res = await Filesystem.readdir({ path: LOG_DIR, directory: Directory.Data });
		names = res.files
			.filter((f) => f.name.startsWith(FILE_PREFIX) && f.name.endsWith(FILE_EXT))
			.map((f) => f.name);
	} catch {
		return [];
	}
	const out: LogFile[] = [];
	for (const name of names) {
		try {
			const path = `${LOG_DIR}/${name}`;
			const r = await Filesystem.readFile({
				path,
				directory: Directory.Data,
				encoding: Encoding.UTF8
			});
			const content = typeof r.data === 'string' ? r.data : '';
			let size = content.length;
			let modified = parseFileTimestamp(name);
			try {
				const stat = await Filesystem.stat({ path, directory: Directory.Data });
				if (typeof stat.size === 'number') size = stat.size;
				if (typeof stat.mtime === 'number') modified = stat.mtime;
			} catch {
				// fall back to derived values
			}
			out.push({ name, content, size, modified });
		} catch {
			// skip unreadable file
		}
	}
	return out;
}

async function fsDelete(name: string): Promise<void> {
	try {
		await Filesystem.deleteFile({ path: `${LOG_DIR}/${name}`, directory: Directory.Data });
	} catch {
		// ignore
	}
}

async function rotateIfNeeded(now: number): Promise<void> {
	const age = now - currentStartedAt;
	if (currentSize <= MAX_FILE_BYTES && age <= MAX_FILE_AGE_MS) return;

	currentName = fileNameForNow(new Date(now));
	currentSize = 0;
	currentStartedAt = now;

	const files = await getAllLogs();
	const sorted = files.sort((a, b) => b.modified - a.modified);
	const excess = sorted.slice(KEEP_FILES);
	for (const f of excess) {
		if (isNative()) await fsDelete(f.name);
		else await idbDelete(f.name);
	}
}

async function persistOnce(chunk: string): Promise<void> {
	if (!currentName) {
		currentName = fileNameForNow();
		currentStartedAt = Date.now();
		currentSize = 0;
	}
	try {
		if (isNative()) {
			currentSize = await fsAppend(currentName, chunk);
		} else {
			currentSize = await idbAppend(currentName, chunk);
		}
		persistFailureLogged = false;
	} catch (err) {
		if (!persistFailureLogged) {
			// failure to persist must not cascade; single console note then silent
			console.warn('[logger] persist failed; continuing without disk writes', err);
			persistFailureLogged = true;
		}
	}
	await rotateIfNeeded(Date.now());
}

async function flush(): Promise<void> {
	if (inflightFlush) return inflightFlush;
	if (buffer.length === 0) return;
	const drained = buffer;
	buffer = [];
	const chunk = drained.map(formatLine).join('');
	inflightFlush = persistOnce(chunk).finally(() => {
		inflightFlush = null;
	});
	return inflightFlush;
}

function startTimer() {
	if (flushTimer || !isClient()) return;
	flushTimer = setInterval(() => {
		void flush();
	}, FLUSH_INTERVAL_MS);
}

function initOnce() {
	if (initialized || !isClient()) return;
	initialized = true;
	currentName = fileNameForNow();
	currentStartedAt = Date.now();
	startTimer();
}

export function log(
	level: LogLevel,
	category: string,
	message: string,
	meta?: Record<string, unknown>
): void {
	if (!isClient()) return;
	initOnce();

	const entry: LogEntry = {
		time: new Date().toISOString(),
		level,
		category,
		message,
		meta: safeMeta(meta)
	};

	buffer.push(entry);
	if (buffer.length > MAX_BUFFER_LINES) {
		buffer.splice(0, buffer.length - MAX_BUFFER_LINES);
	}

	// flush immediately on info+ so debug-only sessions don't burn IO
	if (level !== 'debug') void flush();
}

// keep auto-import-safe names (info/warn/error/debug would collide with locals)
export const logDebug = (category: string, message: string, meta?: Record<string, unknown>) =>
	log('debug', category, message, meta);
export const logInfo = (category: string, message: string, meta?: Record<string, unknown>) =>
	log('info', category, message, meta);
export const logWarn = (category: string, message: string, meta?: Record<string, unknown>) =>
	log('warn', category, message, meta);
export const logError = (category: string, message: string, meta?: Record<string, unknown>) =>
	log('error', category, message, meta);

export async function getCurrentLog(): Promise<string> {
	await flush();
	if (!currentName) return '';
	const files = await getAllLogs();
	return files.find((f) => f.name === currentName)?.content ?? '';
}

export async function getAllLogs(): Promise<LogFile[]> {
	await flush();
	const files = isNative() ? await fsList() : await idbList();
	return files.sort((a, b) => b.modified - a.modified);
}

export async function exportLogs(): Promise<{ uri?: string; text: string }> {
	const files = await getAllLogs();
	const header = `# sky logs export ${new Date().toISOString()} (${files.length} file${files.length === 1 ? '' : 's'})\n\n`;
	const body = files
		.map(
			(f) =>
				`===== ${f.name} (${f.size} bytes, modified ${new Date(f.modified).toISOString()}) =====\n${f.content}\n`
		)
		.join('\n');
	const text = header + body;

	if (!isNative()) {
		return { text };
	}

	const exportName = `sky-logs-${Date.now()}.txt`;
	const exportPath = `${LOG_DIR}/${exportName}`;
	try {
		// ensure target dir exists in cache before writing the export file
		try {
			await Filesystem.mkdir({ path: LOG_DIR, directory: Directory.Cache, recursive: true });
		} catch {
			// already exists or denied; writeFile will surface the real failure
		}
		await Filesystem.writeFile({
			path: exportPath,
			directory: Directory.Cache,
			data: text,
			encoding: Encoding.UTF8
		});
		const uri = await Filesystem.getUri({ path: exportPath, directory: Directory.Cache });
		return { uri: uri.uri, text };
	} catch {
		return { text };
	}
}

export async function clearLogs(): Promise<void> {
	buffer = [];
	currentName = null;
	currentSize = 0;
	currentStartedAt = 0;
	if (isNative()) {
		const files = await fsList();
		for (const f of files) await fsDelete(f.name);
	} else {
		try {
			await idbClear();
		} catch {
			// ignore
		}
	}
}

// expose a way for plugin bootstrap to hook app lifecycle without re-importing capacitor everywhere
export async function attachAppLifecycle(): Promise<() => void> {
	if (!isClient() || !isNative()) return () => {};
	try {
		const handle = await CapApp.addListener('appStateChange', (state) => {
			logInfo('app.lifecycle', state.isActive ? 'resume' : 'pause', { isActive: state.isActive });
		});
		return () => {
			void handle.remove().catch(() => {});
		};
	} catch {
		return () => {};
	}
}

export function useLogger() {
	return {
		log,
		debug: logDebug,
		info: logInfo,
		warn: logWarn,
		error: logError,
		getCurrentLog,
		getAllLogs,
		exportLogs,
		clearLogs
	};
}
