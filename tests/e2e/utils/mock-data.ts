export type AccountType = 'FREE' | 'PRO' | 'WRITER' | 'ORGANIZER' | 'ADMINISTRATOR';
export type Visibility = 'PUBLIC' | 'PRIVATE' | 'UNLISTED' | 'MUTUAL' | 'CIRCLE';

const FIXED_NOW = '2026-05-21T12:00:00.000Z';

const defaultFieldPrivacy = {
	name: 'PUBLIC',
	bio: 'PUBLIC',
	address: 'CIRCLE',
	country: 'PUBLIC',
	email: 'PRIVATE',
	phone_number: 'PRIVATE',
	last_login: 'MUTUAL',
	account_type: 'PUBLIC',
	activities: 'PUBLIC',
	circle: 'MUTUAL',
	friends: 'MUTUAL',
	events: 'MUTUAL',
	impact_points: 'PUBLIC',
	badges: 'PUBLIC'
} as const;

export interface UserOverrides {
	id?: string;
	username?: string;
	full_name?: string;
	is_admin?: boolean;
	created_at?: string;
	account?: Partial<{
		account_type: AccountType;
		visibility: Visibility;
		email_verified: boolean;
		email: string;
		avatar_url: string | null;
		has_password: boolean;
		linked_providers: string[];
		first_name: string;
		last_name: string;
		bio: string;
		country: string;
	}>;
}

export function makeUser(overrides: UserOverrides = {}): Record<string, any> {
	const id = overrides.id ?? 'test-user-1';
	const username = overrides.username ?? 'testuser';
	const accountType: AccountType = overrides.account?.account_type ?? 'FREE';
	const isAdmin = accountType === 'ADMINISTRATOR' || (overrides.is_admin ?? false);

	return {
		id,
		username,
		full_name: overrides.full_name ?? 'Test User',
		created_at: overrides.created_at ?? FIXED_NOW,
		updated_at: FIXED_NOW,
		last_login: FIXED_NOW,
		is_admin: isAdmin,
		bio: overrides.account?.bio ?? 'A test user',
		country: overrides.account?.country ?? 'US',
		address: '',
		phone_number: '',
		email: overrides.account?.email ?? 'test@earth-app.com',
		disabled: false,
		is_friend: false,
		is_my_friend: false,
		is_mutual: false,
		mutual_count: 0,
		is_in_circle: false,
		is_in_my_circle: false,
		account: {
			id: `account-${id}`,
			account_type: accountType,
			username,
			avatar_url: overrides.account?.avatar_url ?? '',
			visibility: overrides.account?.visibility ?? 'PUBLIC',
			email_verified: overrides.account?.email_verified ?? true,
			email: overrides.account?.email ?? 'test@earth-app.com',
			has_password: overrides.account?.has_password ?? true,
			linked_providers: overrides.account?.linked_providers ?? [],
			subscribed: false,
			first_name: overrides.account?.first_name ?? 'Test',
			last_name: overrides.account?.last_name ?? 'User',
			bio: overrides.account?.bio ?? 'A test user',
			country: overrides.account?.country ?? 'US',
			field_privacy: { ...defaultFieldPrivacy }
		}
	};
}

export function makeAdmin(overrides: UserOverrides = {}): Record<string, any> {
	return makeUser({
		id: 'admin-user-1',
		username: 'admin',
		is_admin: true,
		...overrides,
		account: {
			account_type: 'ADMINISTRATOR',
			visibility: 'PUBLIC',
			email_verified: true,
			...(overrides.account ?? {})
		}
	});
}

export function makeActivity(overrides: Record<string, any> = {}): Record<string, any> {
	const id = overrides.id ?? `activity-${Math.random().toString(36).slice(2, 8)}`;
	return {
		id,
		name: overrides.name ?? `Activity ${id}`,
		description: overrides.description ?? 'A neat activity.',
		types: overrides.types ?? ['HOBBY'],
		aliases: overrides.aliases ?? [],
		icon: overrides.icon ?? 'mdi:earth',
		updated_at: FIXED_NOW,
		created_at: FIXED_NOW,
		fields: overrides.fields ?? {},
		...overrides
	};
}

export function makeArticle(overrides: Record<string, any> = {}): Record<string, any> {
	const id = overrides.id ?? `article-${Math.random().toString(36).slice(2, 8)}`;
	const author = overrides.author ?? makeUser({ username: 'author' });
	return {
		id,
		title: overrides.title ?? 'Test Article',
		description: overrides.description ?? 'A brief description of the article.',
		content: overrides.content ?? 'Once upon a time, there was a test article. '.repeat(10),
		color: overrides.color ?? 3368106,
		color_hex: overrides.color_hex ?? '#3366aa',
		tags: overrides.tags ?? [],
		author,
		author_id: overrides.author_id ?? author.id,
		created_at: FIXED_NOW,
		updated_at: FIXED_NOW,
		...overrides
	};
}

export function makeEvent(overrides: Record<string, any> = {}): Record<string, any> {
	const id = overrides.id ?? `event-${Math.random().toString(36).slice(2, 8)}`;
	// keep the default event genuinely upcoming (matches timing.is_upcoming below); a
	// hardcoded calendar date silently goes "past" against the real clock and flips the
	// signup CTA to "Event Ended"
	const start = Date.now() + 86_400_000;
	const end = start + 2 * 3_600_000;
	const host = overrides.host ?? makeUser({ username: 'host' });
	return {
		id,
		hostId: overrides.hostId ?? host.id,
		host,
		name: overrides.name ?? 'Community Picnic',
		description: overrides.description ?? 'Join us for an afternoon picnic.',
		type: overrides.type ?? 'IN_PERSON',
		activities: overrides.activities ?? [],
		location: overrides.location ?? { latitude: 40.785091, longitude: -73.968285 },
		date: overrides.date ?? start,
		date_f: overrides.date_f ?? new Date(start).toISOString(),
		end_date: overrides.end_date ?? end,
		end_date_f: overrides.end_date_f ?? new Date(end).toISOString(),
		visibility: overrides.visibility ?? 'PUBLIC',
		attendee_count: overrides.attendee_count ?? 5,
		is_attending: overrides.is_attending ?? false,
		can_edit: overrides.can_edit ?? false,
		created_at: FIXED_NOW,
		updated_at: FIXED_NOW,
		timing: {
			has_passed: false,
			is_ongoing: false,
			starts_in: 86_400_000,
			is_upcoming: true,
			...(overrides.timing ?? {})
		},
		fields: { cancelled: false, ...(overrides.fields ?? {}) }
	};
}

export function makePrompt(overrides: Record<string, any> = {}): Record<string, any> {
	const id = overrides.id ?? `prompt-${Math.random().toString(36).slice(2, 8)}`;
	const owner = overrides.owner ?? makeUser({ username: 'prompter' });
	return {
		id,
		owner_id: overrides.owner_id ?? owner.id,
		owner,
		prompt: overrides.prompt ?? 'What is something new you learned this week?',
		visibility: overrides.visibility ?? 'PUBLIC',
		responses_count: overrides.responses_count ?? 3,
		has_responded: overrides.has_responded ?? false,
		created_at: FIXED_NOW,
		updated_at: FIXED_NOW
	};
}

export function makePromptResponse(overrides: Record<string, any> = {}): Record<string, any> {
	const id = overrides.id ?? `pr-${Math.random().toString(36).slice(2, 8)}`;
	const owner = overrides.owner ?? makeUser({ username: 'responder', id: 'responder-1' });
	return {
		id,
		prompt_id: overrides.prompt_id ?? 'prompt-1',
		owner,
		response: overrides.response ?? 'I learned how to write playwright tests.',
		created_at: FIXED_NOW,
		updated_at: FIXED_NOW
	};
}

export function makeBadge(overrides: Record<string, any> = {}): Record<string, any> {
	const id = overrides.id ?? `badge-${Math.random().toString(36).slice(2, 8)}`;
	return {
		id,
		name: overrides.name ?? 'First Steps',
		description: overrides.description ?? 'Awarded for getting started.',
		icon: overrides.icon ?? 'mdi:medal',
		rarity: overrides.rarity ?? 'normal',
		granted: overrides.granted ?? false,
		user_id: overrides.user_id ?? 'test-user-1',
		mastered: overrides.mastered ?? false,
		mastered_at: overrides.mastered_at ?? null,
		mastery_exempt: overrides.mastery_exempt ?? false,
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Quests
//
// The frontend (crust store) fetches quest *definitions* and *progress* from
// mantle2, not cloud:
//   - GET /v2/users/quests              -> { total, quests: Quest[] }
//   - GET /v2/users/quests?id=<id>      -> Quest
//   - GET /v2/users/<id>/quest          -> UserQuestProgress | null (active)
//   - GET /v2/users/<id>/quest/history  -> { total, history: {id: HistoryEntry} }
//   - POST {crustBaseUrl}/api/user/updateQuest -> { validated, completed, message }
//
// `makeQuest` returns a real `Quest` shape (title/steps/rarity/reward), NOT the
// old {name,target,rewards} stub. Every quest-step type has a factory below so a
// single quest can carry one of each for the step-type specs.
// ---------------------------------------------------------------------------

export type QuestStepType =
	| 'take_photo_location'
	| 'take_photo_classification'
	| 'take_photo_objects'
	| 'take_photo_caption'
	| 'take_photo_validation'
	| 'take_photo_list'
	| 'article_quiz'
	| 'draw_picture'
	| 'attend_event'
	| 'respond_to_prompt'
	| 'article_read_time'
	| 'activity_read_time'
	| 'transcribe_audio'
	| 'match_terms'
	| 'order_items'
	| 'describe_text'
	| 'submit_event_image'
	| 'distance_covered'
	| 'scan_barcode';

/**
 * Build a single quest step. `parameters` is the positional arg array the
 * frontend reads per type (see MSubmission.vue): e.g. distance_covered reads
 * `parameters[0]` as target meters, scan_barcode reads `[kind, keyword]`,
 * read-time reads `[, targetSeconds]`.
 */
export function makeQuestStep(
	type: QuestStepType,
	overrides: Record<string, any> = {}
): Record<string, any> {
	const defaults: Record<string, { description: string; parameters: any[] }> = {
		take_photo_location: { description: 'Take a photo at the location', parameters: [] },
		take_photo_classification: { description: 'Photograph a tree', parameters: ['tree'] },
		take_photo_objects: { description: 'Photograph two objects', parameters: [['cup', 'book']] },
		take_photo_caption: { description: 'Caption your photo', parameters: [] },
		take_photo_validation: { description: 'Take a valid photo', parameters: [] },
		take_photo_list: { description: 'Photograph an item from the list', parameters: [['leaf']] },
		article_quiz: { description: 'Pass the article quiz', parameters: [] },
		draw_picture: { description: 'Draw a picture', parameters: [] },
		attend_event: { description: 'Attend an event', parameters: [] },
		respond_to_prompt: { description: 'Respond to a prompt', parameters: [] },
		article_read_time: { description: 'Read for 2 minutes', parameters: ['', 120] },
		activity_read_time: { description: 'Read about the activity', parameters: ['', 120] },
		transcribe_audio: { description: 'Record a short note', parameters: ['', '', 10] },
		match_terms: {
			description: 'Match the terms',
			parameters: [
				[
					['Sun', 'Star'],
					['Earth', 'Planet']
				]
			]
		},
		order_items: { description: 'Order the steps', parameters: [['First', 'Second', 'Third']] },
		describe_text: { description: 'Describe what you see', parameters: [] },
		submit_event_image: { description: 'Submit an event image', parameters: [] },
		distance_covered: { description: 'Cover 1 km', parameters: [1000] },
		scan_barcode: { description: 'Scan a food barcode', parameters: ['food'] }
	};

	const base = defaults[type] ?? { description: `Complete a ${type} step`, parameters: [] };
	return {
		type,
		description: overrides.description ?? base.description,
		parameters: overrides.parameters ?? base.parameters,
		...(overrides.reward !== undefined ? { reward: overrides.reward } : {}),
		...(overrides.delay !== undefined ? { delay: overrides.delay } : {}),
		...(overrides.mobile_only !== undefined ? { mobile_only: overrides.mobile_only } : {}),
		...(overrides.tutorial_hint !== undefined ? { tutorial_hint: overrides.tutorial_hint } : {})
	};
}

export function makeQuest(overrides: Record<string, any> = {}): Record<string, any> {
	const id = overrides.id ?? `quest-${Math.random().toString(36).slice(2, 8)}`;
	return {
		id,
		title: overrides.title ?? overrides.name ?? 'Daily Explorer',
		description: overrides.description ?? 'Complete a daily activity.',
		icon: overrides.icon ?? 'mdi:trophy',
		rarity: overrides.rarity ?? 'common',
		reward: overrides.reward ?? 50,
		...(overrides.mobile_only !== undefined ? { mobile_only: overrides.mobile_only } : {}),
		...(overrides.premium !== undefined ? { premium: overrides.premium } : {}),
		...(overrides.permissions !== undefined ? { permissions: overrides.permissions } : {}),
		steps: overrides.steps ?? [makeQuestStep('describe_text'), makeQuestStep('order_items')]
	};
}

/**
 * Active-quest progress envelope (`UserQuestProgress`) the
 * `/v2/users/<id>/quest` route returns. `progress` defaults to empty so the
 * timeline shows the first step as the current/unlocked one.
 */
export function makeUserQuestProgress(
	quest: Record<string, any>,
	overrides: Record<string, any> = {}
): Record<string, any> {
	const progress = overrides.progress ?? [];
	const firstStep = Array.isArray(quest.steps[0]) ? quest.steps[0][0] : quest.steps[0];
	return {
		quest,
		questId: quest.id,
		currentStep: overrides.currentStep ?? firstStep,
		currentStepIndex: overrides.currentStepIndex ?? 0,
		completed: overrides.completed ?? false,
		progress,
		...(overrides.migrationSignals ? { migrationSignals: overrides.migrationSignals } : {}),
		...(overrides.activeReadTime ? { activeReadTime: overrides.activeReadTime } : {})
	};
}

/** One completed-step progress entry (`QuestProgressEntry`). */
export function makeQuestProgressEntry(overrides: Record<string, any> = {}): Record<string, any> {
	return {
		type: overrides.type ?? 'describe_text',
		index: overrides.index ?? 0,
		...(overrides.altIndex !== undefined ? { altIndex: overrides.altIndex } : {}),
		submittedAt: overrides.submittedAt ?? Date.parse(FIXED_NOW),
		...overrides
	};
}

export function makeQuestHistoryEntry(
	quest: Record<string, any>,
	overrides: Record<string, any> = {}
): Record<string, any> {
	return {
		quest,
		questId: quest.id,
		completedAt: overrides.completedAt ?? Date.parse(FIXED_NOW),
		...(overrides.progress ? { progress: overrides.progress } : {})
	};
}

/**
 * An article-quiz definition the cloud `/v1/articles/quiz/create` route returns.
 * Multi-question by default so quiz-flow specs can score partial/full.
 */
export function makeArticleQuiz(overrides: Record<string, any> = {}): Record<string, any> {
	return {
		quiz: {
			questions: overrides.questions ?? defaultQuizQuestions()
		}
	};
}

/** the two default quiz questions shared by the cloud + mantle quiz shapes. */
export function defaultQuizQuestions(): Record<string, any>[] {
	return [
		{
			question: 'What is the capital of France?',
			type: 'multiple_choice',
			options: ['Paris', 'London', 'Rome'],
			correct_answer: 'Paris'
		},
		{
			question: 'Water is made of hydrogen and oxygen.',
			type: 'true_false',
			options: ['True', 'False'],
			correct_answer: 'True'
		}
	];
}

/**
 * The `{ questions, summary }` shape mantle's `GET /v2/articles/<id>/quiz` returns
 * (the article-page quiz path). MQuiz needs `summary` present for its "all answered"
 * gate, so include it. Distinct from the cloud `makeArticleQuiz` envelope.
 */
export function makeArticleQuizV2(overrides: Record<string, any> = {}): Record<string, any> {
	const questions = overrides.questions ?? defaultQuizQuestions();
	return {
		questions,
		summary: {
			total: questions.length,
			multiple_choice_count: questions.filter((q: any) => q.type === 'multiple_choice').length,
			multi_select_count: questions.filter((q: any) => q.type === 'multi_select').length,
			true_false_count: questions.filter((q: any) => q.type === 'true_false').length,
			order_count: questions.filter((q: any) => q.type === 'order').length
		}
	};
}

/**
 * The `ArticleQuizScoreResult` the crust `/api/article/quiz` route returns after a
 * quiz submission (or on score fetch). `results` carries per-question outcome so the
 * MQuiz breakdown renders. Defaults to a perfect 2/2 for the default questions.
 */
export function makeArticleQuizScore(overrides: Record<string, any> = {}): Record<string, any> {
	return {
		score: overrides.score ?? 2,
		total: overrides.total ?? 2,
		scorePercent: overrides.scorePercent ?? 100,
		results: overrides.results ?? [
			{ correct: true, correct_answer_index: 0, user_answer_index: 0 },
			{ correct: true, correct_answer_index: 0, user_answer_index: 0 }
		]
	};
}

export function makeNotification(overrides: Record<string, any> = {}): Record<string, any> {
	const id = overrides.id ?? `notif-${Math.random().toString(36).slice(2, 8)}`;
	return {
		id,
		title: overrides.title ?? 'Notification',
		user_id: overrides.user_id ?? 'test-user-1',
		message: overrides.message ?? 'You have a new notification.',
		type: overrides.type ?? 'info',
		source: overrides.source ?? 'system',
		read: overrides.read ?? false,
		created_at: overrides.created_at ?? Date.now(),
		...overrides
	};
}

export function makeReferralStats(overrides: Record<string, any> = {}): Record<string, any> {
	return {
		// code uses Crockford base32 (no I/L/O/U) - keep mocks regex-valid
		code: overrides.code ?? 'ABC234',
		clicks: overrides.clicks ?? 7,
		conversions: overrides.conversions ?? 2,
		converted_ids: overrides.converted_ids ?? ['author-1', 'host-1']
	};
}

export function makeLeaderboardEntry(overrides: Record<string, any> = {}): Record<string, any> {
	const user = overrides.user ?? makeUser({ id: overrides.id ?? 'lb-user-1', username: 'leader' });
	return {
		rank: overrides.rank ?? 1,
		value: overrides.value ?? 1000,
		user
	};
}

export function makeChallenge(overrides: Record<string, any> = {}): Record<string, any> {
	return {
		id: overrides.id ?? 'chal-1',
		quest_id: overrides.quest_id ?? 'q-current',
		quest_title: overrides.quest_title ?? 'Daily Explorer',
		challenger_id: overrides.challenger_id ?? 'author-1',
		challenger_name: overrides.challenger_name ?? '@author',
		recipient_id: overrides.recipient_id ?? 'test-user-1',
		recipient_name: overrides.recipient_name ?? '@testuser',
		status: overrides.status ?? 'pending',
		created_at: overrides.created_at ?? Date.parse(FIXED_NOW),
		...(overrides.accepted_at ? { accepted_at: overrides.accepted_at } : {})
	};
}

// mood emoji order must match useMood's MOOD_EMOJIS_RUNTIME
const MOOD_EMOJIS = ['😍', '😊', '🤔', '😐', '😟', '😤'] as const;

// MoodSnapshot returned by GET/POST /v2/mood/:topic/:date
export function makeMoodSnapshot(overrides: Record<string, any> = {}): Record<string, any> {
	const counts =
		overrides.counts ??
		MOOD_EMOJIS.reduce((acc, e) => ((acc[e] = 0), acc), {} as Record<string, number>);
	const total =
		overrides.total ?? Object.values(counts).reduce((a: any, b: any) => Number(a) + Number(b), 0);
	return {
		counts,
		total,
		updated_at: overrides.updated_at ?? Date.parse(FIXED_NOW)
	};
}

// PollVote returned by POST /v2/users/current/poll (carries the aggregate the bars read)
export function makePollVote(overrides: Record<string, any> = {}): Record<string, any> {
	const options = overrides.options ?? ['Plant a tree', 'Walk 1 mile'];
	const optionIndex = overrides.option_index ?? 0;
	const counts =
		overrides.counts ?? options.map((_: string, i: number) => (i === optionIndex ? 3 : 1));
	const total = counts.reduce((a: number, b: number) => a + b, 0);
	return {
		poll_id: overrides.poll_id ?? 'q-poll-1',
		option_index: optionIndex,
		option_text: overrides.option_text ?? options[optionIndex] ?? null,
		question: overrides.question ?? 'Which would you choose?',
		options,
		voted_at: overrides.voted_at ?? Date.parse(FIXED_NOW),
		aggregate: {
			counts,
			total,
			question: overrides.question ?? 'Which would you choose?',
			options,
			updated_at: overrides.updated_at ?? Date.parse(FIXED_NOW)
		}
	};
}

// Report returned by POST /v2/reports as { report, deduped }
export function makeReport(overrides: Record<string, any> = {}): Record<string, any> {
	return {
		id: overrides.id ?? 'rep-1',
		content_type: overrides.content_type ?? 'prompt',
		content_id: overrides.content_id ?? 'pmt-1',
		reason: overrides.reason ?? 'spam',
		description: overrides.description,
		source: overrides.source ?? 'user',
		status: overrides.status ?? 'pending',
		report_count: overrides.report_count ?? 1,
		created_at: overrides.created_at ?? Date.parse(FIXED_NOW),
		updated_at: overrides.updated_at ?? Date.parse(FIXED_NOW)
	};
}

export interface PaginatedResponse<T> {
	items: T[];
	total: number;
	page?: number;
	limit?: number;
}

export function paginate<T>(items: T[], page = 1, limit = 25): PaginatedResponse<T> {
	const start = (page - 1) * limit;
	return { items: items.slice(start, start + limit), total: items.length, page, limit };
}

export const MOCK_SESSION_TOKEN = 'mock-session-token-abc123';
export const MOCK_ADMIN_TOKEN = 'mock-admin-token-xyz789';
