import type {
	Activity,
	PixabayImage,
	PixabayVideo,
	WikipediaSummary,
	YouTubeVideo
} from '@earth-app/crust/src/shared/types/activity';
import type { Article } from '@earth-app/crust/src/shared/types/article';
import { capitalizeFully } from '@earth-app/crust/src/shared/util';

export async function makeMServerRequest<T>(
	key: string | null,
	suburl: string,
	token: string | null | undefined = null,
	options: any = {}
) {
	try {
		const headers: Record<string, string> = {
			Accept: 'application/json',
			'User-Agent': `Earth-App Sky/1.0`
		};

		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}

		if (options.body && (options.method === 'POST' || options.method === 'PATCH')) {
			headers['Content-Type'] = 'application/json';
		}

		const data = await $fetch<T>(`https://app.earth-app.com${suburl}`, {
			headers,
			...options
		});

		return {
			success: true,
			data
		};
	} catch (error: any) {
		console.error(`Failed to fetch ${key}:`, error);
		return {
			success: false,
			message: error.message || 'An error occurred while fetching server data.'
		};
	}
}

// User Journeys

export async function getCurrentJourneyM(identifier: string, id: string) {
	if (!id) return { success: true, data: { count: 0 } };

	return await makeMServerRequest<{ count: number; lastWrite?: number }>(
		`journey-${identifier}`,
		`/api/user/journey?type=${identifier}&id=${id}`,
		useCurrentSessionToken()
	);
}

export async function tapCurrentJourneyM(identifier: string, activity?: string) {
	return await makeMServerRequest<{ count: number }>(
		null,
		`/api/user/journey?type=${identifier}${activity ? `&activity=${activity}` : ''}`,
		useCurrentSessionToken(),
		{
			method: 'POST'
		}
	);
}

export async function clearCurrentJourneyM(identifier: string) {
	return await makeMServerRequest<void>(
		null,
		`/api/user/journey/clear?type=${identifier}`,
		useCurrentSessionToken(),
		{
			method: 'POST'
		}
	);
}

// Activity Information Extensions

export async function getActivityWikipediaSummaryM(title: string) {
	return await makeMServerRequest<WikipediaSummary>(
		`wikipedia-summary-${title}`,
		`/api/activity/wikipedia?title=${encodeURIComponent(title)}`,
		useCurrentSessionToken()
	);
}

export async function getActivityYouTubeSearchM(query: string) {
	return await makeMServerRequest<YouTubeVideo[]>(
		`youtube-search-${query}`,
		`/api/activity/youtubeSearch?query=${encodeURIComponent(query)}`,
		useCurrentSessionToken()
	);
}

export async function getActivityWikipediaSearchesM(
	queries: string[],
	onArticleLoaded?: (title: string, summary: WikipediaSummary) => void
) {
	const results: Record<string, WikipediaSummary> = {};
	const responses = await Promise.all(
		queries.map(async (query) => {
			return await makeMServerRequest<{
				query: { search: { title: string; snippet: string }[] };
			}>(
				`wikipedia-search-${query}`,
				`/api/activity/wikipediaSearch?search=${encodeURIComponent(query)}`,
				useCurrentSessionToken()
			).then((res) => {
				if (res.success) {
					return res.data?.query.search || [];
				}

				return [];
			});
		})
	)
		.then((res) => res.flat())
		.then((responses) => responses.filter((r) => r.title?.trim() !== ''));

	// fetch all summaries in parallel instead of sequentially
	const seenTitles = new Set<string>();
	await Promise.allSettled(
		responses.map(async (r) => {
			if (!r.title || seenTitles.has(r.title)) return;
			seenTitles.add(r.title);

			try {
				const res = await getActivityWikipediaSummaryM(r.title);
				if (res.success && res.data) {
					if (res.data.type === 'disambiguation') return;

					res.data.summarySnippet =
						'...' +
						r.snippet
							.replace(/<\/?span[^>]*>/g, '') // Remove any <span> tags from snippet
							.replace(/&quot;/g, '"') // Decode HTML entities
							.replace(/&lt;/g, '<')
							.replace(/&gt;/g, '>')
							.replace(/&#39;/g, "'")
							.replace(/&#039;s/g, "'s")
							.replace(/&#039;/g, "'")
							.replace(/&amp;/g, '&') // Decode &amp; last to prevent double-unescaping
							.trim() +
						'...';

					results[r.title] = res.data;

					// call callback immediately when article loads (for incremental display)
					if (onArticleLoaded) {
						onArticleLoaded(r.title, res.data);
					}
				}
			} catch (error) {
				// Ignore errors for individual summaries
			}
		})
	);

	return results;
}

export async function getActivityPixabayImagesM(
	queries: string[],
	onImageLoaded?: (query: string, images: PixabayImage[]) => void
) {
	const results: Record<string, PixabayImage[]> = {};
	await Promise.all(
		queries.map(async (query) => {
			if (results[query]) return; // Already fetched

			try {
				const res = await makeMServerRequest<PixabayImage[]>(
					`pixabay-images-${query}`,
					`/api/activity/pixabayImages?query=${encodeURIComponent(query)}`,
					useCurrentSessionToken()
				);

				if (res.success && res.data) {
					results[query] = res.data;

					// call callback immediately when images load (for incremental display)
					if (onImageLoaded) {
						onImageLoaded(query, res.data);
					}
				} else {
					results[query] = [];
				}
			} catch (error) {
				results[query] = [];
			}
		})
	);

	return results;
}

export async function getActivityPixabayVideosM(
	queries: string[],
	onVideoLoaded?: (query: string, videos: PixabayVideo[]) => void
) {
	const results: Record<string, PixabayVideo[]> = {};
	await Promise.all(
		queries.map(async (query) => {
			if (results[query]) return; // Already fetched
			try {
				const res = await makeMServerRequest<PixabayVideo[]>(
					`pixabay-videos-${query}`,
					`/api/activity/pixabayVideos?query=${encodeURIComponent(query)}`,
					useCurrentSessionToken()
				);

				if (res.success && res.data) {
					results[query] = res.data;

					// call callback immediately when videos load (for incremental display)
					if (onVideoLoaded) {
						onVideoLoaded(query, res.data);
					}
				} else {
					results[query] = [];
				}
			} catch (error) {
				results[query] = [];
			}
		})
	);

	return results;
}

// Activity Profile

export function useActivityCardsM() {
	const cards = ref<
		{
			title: string;
			icon: string;
			description?: string;
			content?: string;
			link?: string;
			image?: string;
			video?: string;
			youtubeId?: string;
			footer?: string;
		}[]
	>([]);
	const loadRequestId = ref(0);

	const loadCardsForActivity = async (activity: Activity) => {
		if (!activity) return;

		// Create a new request token; used to ignore late async responses
		const reqId = ++loadRequestId.value;
		cards.value = [];

		// Track unique items across sources
		const seen = new Set<string>();

		const safePush = (items: (typeof cards.value)[number] | (typeof cards.value)[number][]) => {
			if (loadRequestId.value !== reqId) return; // stale load, ignore
			const arr = Array.isArray(items) ? items : [items];
			for (const item of arr) {
				const key = item.youtubeId
					? `yt:${item.youtubeId}`
					: item.link
						? `link:${item.link}`
						: `t:${item.title}`;
				if (seen.has(key)) continue;
				seen.add(key);

				const lower = Math.min(4, cards.value.length);
				const upper = cards.value.length;
				const randomPlace = lower + Math.floor(Math.random() * (upper - lower + 1));
				cards.value.splice(randomPlace, 0, item);
			}
		};

		const ytQueries = [`what is ${activity.name}`, `how to ${activity.name}`];
		const ytPromises = ytQueries.map((q) =>
			getActivityYouTubeSearchM(q)
				.then((res) => {
					if (res.success && res.data) {
						safePush(
							res.data.map((video) => ({
								title: video.title,
								icon: 'cib:youtube',
								description: video.uploaded_at,
								link: `https://www.youtube.com/watch?v=${video.id}`,
								youtubeId: video.id
							}))
						);
					}
				})
				.catch(() => {
					// ignore individual source failures
				})
		);
		await Promise.allSettled(ytPromises);

		// Wikipedia searches (name + aliases)
		try {
			const terms = [activity.name, ...(activity.aliases || [])];
			await getActivityWikipediaSearchesM(terms, (_, entry) => {
				const key = `wp:${entry.pageid}`;
				if (seen.has(key)) return;
				seen.add(key);
				safePush({
					title: entry.title,
					icon: 'cib:wikipedia',
					description: entry.description,
					content: entry.extract,
					link: `https://en.wikipedia.org/wiki/${entry.titles.canonical}`,
					image: entry.originalimage?.source,
					footer: entry.summarySnippet
				});
			});
		} catch (e) {
			// ignore
		}

		// Pixabay image searches (name + aliases)
		try {
			const terms = [activity.name, ...(activity.aliases || [])];
			await getActivityPixabayImagesM(terms, (_, images) => {
				safePush(
					images.map((image) => ({
						title: capitalizeFully(activity.name),
						icon: 'mdi:image',
						description: `Photo by ${image.user} on Pixabay`,
						link: image.pageURL,
						image: image.webformatURL
					}))
				);
			});
		} catch (e) {
			// ignore
		}

		// Pixabay video searches (name + aliases)
		try {
			const terms = [activity.name, ...(activity.aliases || [])];
			await getActivityPixabayVideosM(terms, (_, videos) => {
				safePush(
					videos.map((video) => ({
						title: capitalizeFully(activity.name),
						icon: 'mdi:video',
						description: `Video by ${video.user} on Pixabay`,
						video: video.videos.medium.url
					}))
				);
			});
		} catch (e) {
			// ignore
		}
	};

	return { cards, loadRequestId, loadCardsForActivity };
}

// Articles

export async function getSimilarArticlesM(article: Article, count: number = 5) {
	const pool = await getRandomArticles(Math.min(count * 3, 15)).then((res) =>
		res.success ? res.data : res.message
	);

	if (!pool || typeof pool === 'string') {
		throw new Error(`Failed to fetch random articles: ${pool}`);
	}

	if ('message' in pool) {
		throw new Error(`Failed to fetch random articles: ${pool.code} ${pool.message}`);
	}

	if (!pool || pool.length === 0) {
		return { success: true, data: [] };
	}

	const res = await makeMServerRequest<Article[]>(
		`article-${article.id}-similar_articles`,
		`/api/article/similar`,
		useCurrentSessionToken(),
		{
			method: 'POST',
			body: { article, count, pool }
		}
	);

	if (res.success && res.data) {
		if ('message' in res.data) {
			return res;
		}

		// load similar articles into state
		for (const similarArticle of res.data) {
			useState<Article | null>(`article-${similarArticle.id}`, () => similarArticle);
		}
	}

	return res;
}
