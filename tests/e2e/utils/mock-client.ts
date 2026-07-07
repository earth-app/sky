import { CLOUD_PORT, MANTLE_PORT } from './mock-server';

export type Backend = 'mantle' | 'cloud';

export interface OverrideSpec {
	backend?: Backend;
	method: string;
	path: string | RegExp;
	status?: number;
	body: any;
	headers?: Record<string, string>;
	once?: boolean;
	delayMs?: number; // simulate hanging backend
}

function baseUrl(backend: Backend): string {
	return backend === 'cloud' ? `http://127.0.0.1:${CLOUD_PORT}` : `http://127.0.0.1:${MANTLE_PORT}`;
}

export class MockClient {
	constructor(public readonly testId: string) {}

	async set(spec: OverrideSpec): Promise<void> {
		const backend = spec.backend ?? 'mantle';
		const url = `${baseUrl(backend)}/__mock__/override`;
		const path =
			spec.path instanceof RegExp
				? spec.path.source
				: `^${spec.path.replace(/\\/g, '\\\\').replace(/[.*+?^${}()|[\]]/g, (m) => (m === '.' ? '\\.' : m))}$`;
		await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				method: spec.method.toUpperCase(),
				path,
				status: spec.status ?? 200,
				body: spec.body,
				headers: spec.headers,
				once: spec.once ?? true,
				delayMs: spec.delayMs,
				testId: this.testId
			})
		});
	}

	/**
	 * Register multiple overrides at once. Order matters - first registered = first matched.
	 */
	async setMany(specs: OverrideSpec[]): Promise<void> {
		for (const spec of specs) await this.set(spec);
	}

	/**
	 * Reply to the next matching request with the body as a raw JSON STRING (content-type
	 * text/plain) - emulates the native CapacitorHttp transport handing back an unparsed
	 * string the shared request layer must parse itself.
	 */
	async respondRawString(
		method: string,
		path: string | RegExp,
		body: any,
		opts: { backend?: Backend; status?: number; once?: boolean } = {}
	): Promise<void> {
		await this.set({
			backend: opts.backend,
			method,
			path,
			status: opts.status ?? 200,
			headers: { 'content-type': 'text/plain' },
			body: typeof body === 'string' ? body : JSON.stringify(body),
			once: opts.once ?? false
		});
	}

	/**
	 * Reply with the real payload wrapped in the { data, status, url } transport ENVELOPE -
	 * the shape native CapacitorHttp uses for larger bodies. The request layer must unwrap it.
	 */
	async respondEnvelope(
		method: string,
		path: string | RegExp,
		inner: any,
		opts: { backend?: Backend; status?: number; once?: boolean } = {}
	): Promise<void> {
		await this.set({
			backend: opts.backend,
			method,
			path,
			status: opts.status ?? 200,
			body: {
				data: inner,
				status: opts.status ?? 200,
				url: typeof path === 'string' ? path : undefined
			},
			once: opts.once ?? false
		});
	}

	/**
	 * Arm a ONE-SHOT transient failure (default 500). The shared request layer retries the
	 * GET (or a later refetch fires), and the second attempt falls through to the seeded
	 * default route - so the UI must self-heal rather than blank.
	 */
	async respondTransientThenSuccess(
		method: string,
		path: string | RegExp,
		opts: { backend?: Backend; status?: number; body?: any } = {}
	): Promise<void> {
		await this.set({
			backend: opts.backend,
			method,
			path,
			status: opts.status ?? 500,
			body: opts.body ?? { message: 'Internal error' },
			once: true
		});
	}

	/**
	 * Make every request from this test see `user` as the current user.
	 * Pass `null` to anonymize. Optionally also bind a token so SSR-side
	 * lookups (which can't read the X-Test-Id header) resolve correctly.
	 */
	async loginAs(userId: string | null, token?: string | null): Promise<void> {
		for (const backend of ['mantle', 'cloud'] as const) {
			await fetch(`${baseUrl(backend)}/__mock__/login-as`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ userId, testId: this.testId, token })
			});
		}
	}

	/**
	 * Register a user definition with the mock so subsequent `/v2/users/current`
	 * calls return it. Use together with `loginAs` to swap identities mid-test.
	 */
	async registerUser(user: Record<string, any>): Promise<void> {
		await fetch(`${baseUrl('mantle')}/__mock__/user`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ user })
		});
	}

	/**
	 * Register (or replace) a quest definition in the catalog so
	 * `/v2/users/quests` and `/v2/users/quests?id=` resolve it.
	 */
	async registerQuest(quest: Record<string, any>): Promise<void> {
		await fetch(`${baseUrl('mantle')}/__mock__/quest`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ quest })
		});
	}

	/**
	 * Set the active quest progress (`UserQuestProgress`) this test sees from
	 * `/v2/users/<id>/quest`. Pass `null` to clear (no active quest).
	 */
	async setActiveQuest(active: Record<string, any> | null): Promise<void> {
		await fetch(`${baseUrl('mantle')}/__mock__/active-quest`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ active, testId: this.testId })
		});
	}

	async reset(opts: { signal?: AbortSignal } = {}): Promise<void> {
		for (const backend of ['mantle', 'cloud'] as const) {
			await fetch(`${baseUrl(backend)}/__mock__/reset`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ testId: this.testId }),
				signal: opts.signal
			});
		}
	}

	async healthCheck(): Promise<boolean> {
		try {
			const [m, c] = await Promise.all([
				fetch(`${baseUrl('mantle')}/__mock__/health`).then((r) => r.ok),
				fetch(`${baseUrl('cloud')}/__mock__/health`).then((r) => r.ok)
			]);
			return m && c;
		} catch {
			return false;
		}
	}
}
