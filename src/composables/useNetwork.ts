import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { ConnectionStatus, ConnectionType } from '@capacitor/network';
import type { Activity } from 'types/activity';
import type { Article } from 'types/article';
import type { Prompt } from 'types/prompts';
import { validateSessionAllowOffline } from '~/composables/useOfflineAuth';
import { useActivityCardsM } from '~/composables/useServer';

export const networkOffline = ref(false);
export const connectionType = ref<ConnectionType>('unknown');
export const offlineModeEnabled = ref(false);
export const dataSaverModeEnabled = ref(false);

export const isOffline = computed(() => offlineModeEnabled.value || networkOffline.value);
export const isCellularConnection = computed(() => connectionType.value === 'cellular');
export const isDataConstrained = computed(
	() => dataSaverModeEnabled.value && isCellularConnection.value
);

export function applyNetworkStatus(status: Pick<ConnectionStatus, 'connected' | 'connectionType'>) {
	networkOffline.value = !status.connected;
	connectionType.value = status.connectionType;
}

export function setOfflineModeEnabled(enabled: boolean) {
	offlineModeEnabled.value = enabled;
}

export function setDataSaverModeEnabled(enabled: boolean) {
	dataSaverModeEnabled.value = enabled;
}

export type DownloadableType = 'article' | 'prompt' | 'activity';

export type OfflineActivityCard = {
	image?: string;
	image_offline?: string;
	youtubeId?: string;
	link?: string;
	video?: string;
} & Record<string, unknown>;

export type DownloadedArticle = Article & { type: 'article' };
export type DownloadedPrompt = Prompt & { type: 'prompt' };
export type DownloadedActivity = Activity & {
	type: 'activity';
	offline_cards?: OfflineActivityCard[];
};

export type DownloadedItem = DownloadedArticle | DownloadedPrompt | DownloadedActivity;

export type DownloadPayloadByType = {
	article: Article | DownloadedArticle;
	prompt: Prompt | DownloadedPrompt;
	activity: Activity | DownloadedActivity;
};

type DownloadedItemByType<TType extends DownloadableType> = Extract<
	DownloadedItem,
	{ type: TType }
>;

export interface Downloadable<TType extends DownloadableType = DownloadableType> {
	id: string;
	type: TType;
	payload?: DownloadPayloadByType[TType];
}

// Internal reactive state shared across callers
const _downloaded = ref<Record<string, boolean>>({});
const _downloading = ref<Record<string, boolean>>({});
let _initialized = false;
let _initPromise: Promise<void> | null = null;
let _downloadsCachePromise: Promise<Cache | null> | null = null;

const MAX_ACTIVITY_SNAPSHOT_CARDS = 10;
const MAX_ACTIVITY_OFFLINE_IMAGE_CARDS = 4;
const MAX_ACTIVITY_IMAGE_DATA_URL_LENGTH = 140_000;
const MAX_PROFILE_IMAGE_DATA_URL_LENGTH = 60_000;
const CACHE_MIRROR_MAX_JSON_BYTES = 220_000;
const DATA_SAVER_ACTIVITY_SNAPSHOT_CARDS = 6;
const DATA_SAVER_ACTIVITY_OFFLINE_IMAGE_CARDS = 2;
const DATA_SAVER_ACTIVITY_IMAGE_DATA_URL_LENGTH = 90_000;
const DATA_SAVER_PROFILE_IMAGE_DATA_URL_LENGTH = 40_000;
const DATA_SAVER_FETCH_DELAY_MS = 180;

async function maybeDelayForDataSaver() {
	if (!isDataConstrained.value) return;

	await new Promise((resolve) => setTimeout(resolve, DATA_SAVER_FETCH_DELAY_MS));
}

async function getDownloadsCache(): Promise<Cache | null> {
	if (typeof caches === 'undefined') return null;
	if (!_downloadsCachePromise) {
		_downloadsCachePromise = caches.open('downloads').catch((err) => {
			console.warn('Failed to open downloads cache:', err);
			return null;
		});
	}

	return await _downloadsCachePromise;
}

function shouldMirrorJsonInCache(json: string) {
	return new TextEncoder().encode(json).byteLength <= CACHE_MIRROR_MAX_JSON_BYTES;
}

async function syncDownloadCacheMirror(key: string, json: string, enabled: boolean) {
	try {
		const cache = await getDownloadsCache();
		if (!cache) return;

		if (!enabled) {
			await cache.delete(`/downloads/${key}`);
			return;
		}

		await cache.put(
			`/downloads/${key}`,
			new Response(json, { headers: { 'Content-Type': 'application/json' } })
		);
	} catch (err) {
		console.warn('Cache mirror sync failed:', err);
	}
}

function keyFor(type: string, id: string) {
	return `${type}-${id}`;
}

function normalizeDownloadedPayload<TType extends DownloadableType>(
	type: TType,
	id: string,
	payload: unknown
): DownloadedItemByType<TType> | null {
	if (!payload || typeof payload !== 'object') return null;

	const record = payload as Record<string, unknown>;
	const normalizedId = typeof record.id === 'string' ? record.id : id;

	return {
		...(record as object),
		id: normalizedId,
		type
	} as DownloadedItemByType<TType>;
}

function fsFilenameForKey(key: string, compressed = false) {
	return `downloads/${key}.json${compressed ? '.gz' : ''}`;
}

function markDownloaded(key: string) {
	if (_downloaded.value[key]) return;
	_downloaded.value[key] = true;
	_downloaded.value = { ..._downloaded.value };
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
	let binary = '';
	const bytes = new Uint8Array(buffer);
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		const val = bytes[i] ?? 0;
		binary += String.fromCharCode(val);
	}
	return btoa(binary);
}

function base64ToArrayBuffer(base64: string) {
	const binary = atob(base64);
	const len = binary.length;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

function isHttpUrl(url?: string | null): url is string {
	return Boolean(url && /^https?:\/\//i.test(url));
}

function isYouTubeUrl(url?: string | null) {
	if (!url) return false;

	try {
		const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
		return (
			host === 'youtube.com' ||
			host.endsWith('.youtube.com') ||
			host === 'youtu.be' ||
			host.endsWith('.youtu.be') ||
			host === 'youtube-nocookie.com' ||
			host.endsWith('.youtube-nocookie.com')
		);
	} catch {
		return /youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(url);
	}
}

function isYouTubeCard(card: { youtubeId?: string; link?: string; video?: string }) {
	return Boolean(card.youtubeId) || isYouTubeUrl(card.link) || isYouTubeUrl(card.video);
}

async function blobToDataUrl(blob: Blob): Promise<string | null> {
	if (typeof FileReader === 'undefined') return null;

	return await new Promise((resolve) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			if (typeof reader.result === 'string') {
				resolve(reader.result);
				return;
			}

			resolve(null);
		};
		reader.onerror = () => resolve(null);
		reader.readAsDataURL(blob);
	});
}

async function urlToDataUrl(
	url?: string | null,
	options: { maxLength?: number } = {}
): Promise<string | null> {
	if (!isHttpUrl(url) || typeof fetch === 'undefined') return null;
	if (isOffline.value) return null;

	await maybeDelayForDataSaver();

	try {
		const res = await fetch(url, { method: 'GET' });
		if (!res.ok) return null;
		const blob = await res.blob();
		const dataUrl = await blobToDataUrl(blob);
		if (!dataUrl) return null;

		if (options.maxLength && dataUrl.length > options.maxLength) {
			return null;
		}

		return dataUrl;
	} catch {
		return null;
	}
}

async function buildOfflineActivityCards(activity: Activity) {
	try {
		const { cards, loadCardsForActivity } = useActivityCardsM();
		await loadCardsForActivity(activity);

		const maxSnapshotCards = isDataConstrained.value
			? DATA_SAVER_ACTIVITY_SNAPSHOT_CARDS
			: MAX_ACTIVITY_SNAPSHOT_CARDS;
		const maxOfflineImageCards = isDataConstrained.value
			? DATA_SAVER_ACTIVITY_OFFLINE_IMAGE_CARDS
			: MAX_ACTIVITY_OFFLINE_IMAGE_CARDS;
		const maxImageLength = isDataConstrained.value
			? DATA_SAVER_ACTIVITY_IMAGE_DATA_URL_LENGTH
			: MAX_ACTIVITY_IMAGE_DATA_URL_LENGTH;

		const snapshot = cards.value.filter((card) => !isYouTubeCard(card)).slice(0, maxSnapshotCards);
		const withOfflineAssets = await Promise.all(
			snapshot.map(async (card, index) => {
				if (index >= maxOfflineImageCards) {
					return {
						...card,
						image_offline: undefined
					};
				}

				const imageOffline = await urlToDataUrl(card.image, {
					maxLength: maxImageLength
				});

				return {
					...card,
					image_offline: imageOffline || undefined
				};
			})
		);

		return withOfflineAssets;
	} catch (err) {
		console.warn('Failed to build offline activity cards:', err);
		return [];
	}
}

async function ensureInitialized() {
	if (_initialized) return;
	if (_initPromise) {
		await _initPromise;
		return;
	}

	_initPromise = (async () => {
		try {
			// Ensure downloads directory exists
			try {
				await Filesystem.readdir({ path: 'downloads', directory: Directory.Data });
			} catch (e) {
				try {
					await Filesystem.mkdir({ path: 'downloads', directory: Directory.Data });
				} catch {}
			}

			// Populate initial downloaded map from filesystem
			const files = await Filesystem.readdir({ path: 'downloads', directory: Directory.Data });
			for (const file of files.files) {
				if (file.name.endsWith('.json') || file.name.endsWith('.json.gz')) {
					const name = file.name.replace(/\.json(\.gz)?$/, '');
					_downloaded.value[name] = true;
				}
			}
			// ensure reactivity after bulk population
			_downloaded.value = { ..._downloaded.value };

			// Also check CacheStorage for quick-access items (merge)
			const cache = await getDownloadsCache();
			if (cache) {
				try {
					const keys = await cache.keys();
					for (const req of keys) {
						try {
							const url = new URL(req.url);
							const name = url.pathname.replace(/^\//, '').replace(/^downloads\//, '');
							if (name) {
								_downloaded.value[name] = true;
							}
						} catch (e) {
							// ignore malformed request.url
						}
					}
				} catch (err) {
					console.warn('Cache read during init failed:', err);
				}
				// ensure reactivity after merging cache entries
				_downloaded.value = { ..._downloaded.value };
			}

			_initialized = true;
		} catch (err) {
			_initialized = false;
			console.warn('Failed to initialize downloads store:', err);
		} finally {
			_initPromise = null;
		}
	})();

	await _initPromise;
}

export function useDownloads() {
	if (import.meta.client) {
		void ensureInitialized();
	}

	const isDownloaded = (type: DownloadableType, id: string) =>
		computed(() => {
			const key = keyFor(type, id);
			return !!_downloaded.value[key];
		});

	const isDownloading = (type: DownloadableType, id: string) =>
		computed(() => {
			const key = keyFor(type, id);
			return !!_downloading.value[key];
		});

	const exists = async (type: DownloadableType, id: string): Promise<boolean> => {
		await ensureInitialized();
		const key = keyFor(type, id);
		if (_downloaded.value[key]) return true;

		// fallback: check filesystem directly
		try {
			await Filesystem.stat({ path: fsFilenameForKey(key, false), directory: Directory.Data });
			markDownloaded(key);
			return true;
		} catch (e) {
			try {
				await Filesystem.stat({ path: fsFilenameForKey(key, true), directory: Directory.Data });
				markDownloaded(key);
				return true;
			} catch (e2) {
				// not found
			}
		}

		try {
			const cache = await getDownloadsCache();
			if (cache) {
				const cached = await cache.match(`/downloads/${key}`);
				if (cached) {
					markDownloaded(key);
					return true;
				}
			}
		} catch (err) {
			console.warn('Cache access failed in exists():', err);
		}

		return false;
	};

	const get = async <TType extends DownloadableType>(
		type: TType,
		id: string
	): Promise<DownloadedItemByType<TType> | null> => {
		await ensureInitialized();
		const key = keyFor(type, id);

		try {
			const cache = await getDownloadsCache();
			if (cache) {
				const cached = await cache.match(`/downloads/${key}`);
				if (cached) {
					try {
						const parsed = await cached.json();
						const normalized = normalizeDownloadedPayload(type, id, parsed);
						if (normalized) {
							markDownloaded(key);
							return normalized;
						}
					} catch (err) {
						console.warn(`Failed to parse cached response for ${key}:`, err);
					}
				}
			}
		} catch (err) {
			console.warn('Cache access failed in get():', err);
		}

		// Try uncompressed JSON
		try {
			const file = await Filesystem.readFile({
				path: fsFilenameForKey(key, false),
				directory: Directory.Data,
				encoding: Encoding.UTF8
			});
			const data =
				typeof (file.data as any).text === 'function'
					? await (file.data as any).text()
					: (file.data as string);
			const parsed = JSON.parse(data);
			const normalized = normalizeDownloadedPayload(type, id, parsed);
			if (normalized) {
				markDownloaded(key);
				return normalized;
			}
		} catch (err) {
			// try compressed
		}

		try {
			const file = await Filesystem.readFile({
				path: fsFilenameForKey(key, true),
				directory: Directory.Data,
				encoding: Encoding.UTF8
			});
			// file.data is base64 encoded compressed bytes
			const base64 = file.data as string;
			const ab = base64ToArrayBuffer(base64);
			if (typeof DecompressionStream !== 'undefined') {
				try {
					const blob = new Blob([ab]);
					const ds = blob.stream().pipeThrough(new DecompressionStream('gzip'));
					const text = await new Response(ds).text();
					const parsed = JSON.parse(text);
					const normalized = normalizeDownloadedPayload(type, id, parsed);
					if (normalized) {
						markDownloaded(key);
						return normalized;
					}
				} catch (err) {
					console.warn('Decompression failed for', key, err);
				}
			}
			// fallback: try interpret as utf8
			try {
				const text = new TextDecoder().decode(new Uint8Array(ab));
				const parsed = JSON.parse(text);
				const normalized = normalizeDownloadedPayload(type, id, parsed);
				if (normalized) {
					markDownloaded(key);
					return normalized;
				}
			} catch (err) {
				console.error('Failed to decode compressed data for', key, err);
			}
		} catch (err) {
			// not found
		}

		return null;
	};

	async function sanitizePayload(item: Downloadable) {
		if (!item.payload) return item;
		switch (item.type) {
			case 'prompt': {
				const p = item.payload as any;
				const offlineOwnerAvatar = await urlToDataUrl(p?.owner?.account?.avatar_url, {
					maxLength: isDataConstrained.value
						? DATA_SAVER_PROFILE_IMAGE_DATA_URL_LENGTH
						: MAX_PROFILE_IMAGE_DATA_URL_LENGTH
				});
				const owner = offlineOwnerAvatar
					? {
							...p.owner,
							account: {
								...p.owner?.account,
								avatar_url_offline: offlineOwnerAvatar
							}
						}
					: p.owner;

				return {
					id: p.id,
					prompt: p.prompt,
					owner,
					owner_id: p.owner_id,
					responses_count: p.responses_count,
					has_responded: p.has_responded,
					visibility: p.visibility,
					created_at: p.created_at,
					updated_at: p.updated_at,
					type: 'prompt'
				};
			}
			case 'article': {
				const article = item.payload as any;
				const offlineAuthorAvatar = await urlToDataUrl(article?.author?.account?.avatar_url, {
					maxLength: isDataConstrained.value
						? DATA_SAVER_PROFILE_IMAGE_DATA_URL_LENGTH
						: MAX_PROFILE_IMAGE_DATA_URL_LENGTH
				});
				const offlineFavicon = await urlToDataUrl(article?.ocean?.favicon, {
					maxLength: isDataConstrained.value
						? DATA_SAVER_PROFILE_IMAGE_DATA_URL_LENGTH
						: MAX_PROFILE_IMAGE_DATA_URL_LENGTH
				});

				return {
					...article,
					author: offlineAuthorAvatar
						? {
								...article.author,
								account: {
									...article.author?.account,
									avatar_url_offline: offlineAuthorAvatar
								}
							}
						: article.author,
					ocean: offlineFavicon
						? {
								...article.ocean,
								favicon_offline: offlineFavicon
							}
						: article.ocean,
					id: article.id,
					type: 'article'
				};
			}
			case 'activity': {
				const activity = item.payload as Activity & Record<string, any>;
				const offlineCards = await buildOfflineActivityCards(activity);
				return {
					...activity,
					offline_cards: offlineCards,
					id: activity.id,
					type: 'activity'
				};
			}
			default:
				return item.payload;
		}
	}

	const download = async (item: Downloadable) => {
		await ensureInitialized();

		// Require a valid session (online validated or cached offline session)
		const authUser = await validateSessionAllowOffline();
		if (!authUser) throw new Error('Authentication required to download content for offline use.');

		const key = keyFor(item.type, item.id);
		if (_downloading.value[key]) return; // already downloading
		_downloading.value[key] = true;
		// ensure reactivity for new download state
		_downloading.value = { ..._downloading.value };

		try {
			// Clear stale on-disk variants so get() cannot read old data after an update.
			try {
				await Filesystem.deleteFile({
					path: fsFilenameForKey(key, false),
					directory: Directory.Data
				});
			} catch {}
			try {
				await Filesystem.deleteFile({
					path: fsFilenameForKey(key, true),
					directory: Directory.Data
				});
			} catch {}

			const sanitized = await sanitizePayload(item);
			const json = JSON.stringify(sanitized);
			const shouldMirrorCache = shouldMirrorJsonInCache(json);

			// write compressed if possible
			if (typeof CompressionStream !== 'undefined' && typeof Blob !== 'undefined') {
				try {
					const input = new Blob([json]).stream();
					const compressed = input.pipeThrough(new CompressionStream('gzip'));
					const ab = await new Response(compressed).arrayBuffer();
					const b64 = arrayBufferToBase64(ab);
					await Filesystem.writeFile({
						path: fsFilenameForKey(key, true),
						data: b64,
						directory: Directory.Data,
						encoding: Encoding.UTF8
					});
					await syncDownloadCacheMirror(key, json, shouldMirrorCache);
				} catch (err) {
					console.warn('Compression/write failed, falling back to plain write:', err);
					await Filesystem.writeFile({
						path: fsFilenameForKey(key, false),
						data: json,
						directory: Directory.Data,
						encoding: Encoding.UTF8
					});
					await syncDownloadCacheMirror(key, json, shouldMirrorCache);
				}
			} else {
				// no compression support
				await Filesystem.writeFile({
					path: fsFilenameForKey(key, false),
					data: json,
					directory: Directory.Data,
					encoding: Encoding.UTF8
				});
				await syncDownloadCacheMirror(key, json, shouldMirrorCache);
			}

			_downloaded.value[key] = true;
			// ensure consumers see the update
			_downloaded.value = { ..._downloaded.value };
		} catch (err) {
			console.error('Download failed for', key, err);
			throw err;
		} finally {
			delete _downloading.value[key];
			_downloading.value = { ..._downloading.value };
		}
	};

	const remove = async (type: DownloadableType, id: string) => {
		await ensureInitialized();
		const key = keyFor(type, id);
		try {
			const cache = await getDownloadsCache();
			if (cache) {
				await cache.delete(`/downloads/${key}`);
			}
		} catch (err) {
			console.warn(`Cache delete failed for ${key}:`, err);
		}

		try {
			await Filesystem.deleteFile({
				path: fsFilenameForKey(key, false),
				directory: Directory.Data
			});
		} catch (e) {
			// ignore
		}
		try {
			await Filesystem.deleteFile({ path: fsFilenameForKey(key, true), directory: Directory.Data });
		} catch (e) {
			// ignore
		}

		if (_downloaded.value[key]) {
			delete _downloaded.value[key];
			_downloaded.value = { ..._downloaded.value };
		}
	};

	const all = async <TType extends DownloadableType = DownloadableType>(opts?: {
		type?: TType;
	}) => {
		await ensureInitialized();
		const reads: Promise<DownloadedItemByType<TType> | null>[] = [];
		const keys = Object.keys(_downloaded.value || {});
		for (const k of keys) {
			if (!_downloaded.value[k]) continue;
			const parts = k.split('-');
			const t = parts.shift();
			const id = parts.join('-');
			if (!t) continue;
			if (opts?.type && t !== opts.type) continue;
			reads.push(get(t as TType, id));
		}

		const results = await Promise.all(reads);
		return results.filter(Boolean) as DownloadedItemByType<TType>[];
	};

	const usedSpace = async (): Promise<string> => {
		await ensureInitialized();
		try {
			const files = await Filesystem.readdir({ path: 'downloads', directory: Directory.Data });
			let totalSize = 0;
			for (const file of files.files) {
				if (file.name.endsWith('.json') || file.name.endsWith('.json.gz')) {
					try {
						const stat = await Filesystem.stat({
							path: `downloads/${file.name}`,
							directory: Directory.Data
						});
						totalSize += stat.size || 0;
					} catch (e) {
						// ignore
					}
				}
			}

			// format in B/KB/MB/GB
			if (totalSize < 1024) {
				return `${totalSize} B`;
			}

			const kb = totalSize / 1024;
			if (kb < 1024) {
				return `${kb.toFixed(2)} KB`;
			}

			const mb = kb / 1024;
			if (mb < 1024) {
				return `${mb.toFixed(2)} MB`;
			}

			const gb = mb / 1024;
			return `${gb.toFixed(2)} GB`;
		} catch (err) {
			console.error('Error calculating used space:', err);
			return '0B';
		}
	};

	return {
		exists,
		get,
		download,
		remove,
		all,
		usedSpace,
		isDownloaded,
		isDownloading,
		downloaded: _downloaded,
		downloading: _downloading,
		init: ensureInitialized
	};
}

export function useDownloadState<TType extends DownloadableType>(
	source: () => Downloadable<TType> | null | undefined
) {
	const downloads = useDownloads();
	const downloadable = computed(() => source() || null);
	const downloadKey = computed(() => {
		const item = downloadable.value;
		if (!item) return null;
		return `${item.type}-${item.id}`;
	});
	const isDownloaded = computed(() => {
		const key = downloadKey.value;
		if (!key) return false;
		return Boolean(downloads.downloaded.value[key]);
	});
	const isDownloading = computed(() => {
		const key = downloadKey.value;
		if (!key) return false;
		return Boolean(downloads.downloading.value[key]);
	});

	const startDownload = async (payload?: DownloadPayloadByType[TType]) => {
		const item = downloadable.value;
		if (!item || isDownloaded.value || isDownloading.value) return false;

		await downloads.download({
			id: item.id,
			type: item.type,
			payload: payload ?? item.payload
		});

		return true;
	};

	const deleteDownload = async () => {
		const item = downloadable.value;
		if (!item || isDownloading.value || !isDownloaded.value) return false;

		await downloads.remove(item.type, item.id);
		return true;
	};

	return {
		downloadable,
		downloadKey,
		isDownloaded,
		isDownloading,
		startDownload,
		deleteDownload
	};
}
