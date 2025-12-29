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
