// @vitest-environment node
import type { User } from 'types/user';
import { describe, expect, it } from 'vitest';
import { pickRecommendedFriendId, sortFriendsForChallenge } from '~/utils/challengeFriends';

type FriendInit = {
	id: string;
	username: string;
	last_login?: string;
	is_mutual?: boolean;
	is_in_my_circle?: boolean;
	lastLoginPrivacy?: 'PRIVATE' | 'CIRCLE' | 'MUTUAL' | 'PUBLIC';
};

// minimal User shape carrying only the fields the sort reads
function friend(init: FriendInit): User {
	return {
		id: init.id,
		username: init.username,
		last_login: init.last_login,
		is_mutual: init.is_mutual ?? false,
		is_in_my_circle: init.is_in_my_circle ?? false,
		account: {
			field_privacy: {
				last_login: init.lastLoginPrivacy ?? 'PUBLIC'
			}
		}
	} as unknown as User;
}

const ids = (rows: { user: User }[]) => rows.map((r) => r.user.id);

describe('sortFriendsForChallenge', () => {
	it('puts circle members first regardless of last_login', () => {
		// circle member logged in years ago; non-circle friend logged in recently
		const inCircle = friend({
			id: 'c',
			username: 'circleuser',
			is_in_my_circle: true,
			last_login: '2020-01-01T00:00:00.000Z'
		});
		const notCircle = friend({
			id: 'n',
			username: 'newuser',
			last_login: '2026-01-01T00:00:00.000Z'
		});

		expect(ids(sortFriendsForChallenge([notCircle, inCircle], []))).toEqual(['c', 'n']);
	});

	it('sorts by last_login descending within the same circle tier', () => {
		// the newer login wins even though its username sorts alphabetically last
		const older = friend({ id: 'o', username: 'auser', last_login: '2025-01-01T00:00:00.000Z' });
		const newer = friend({ id: 'n', username: 'zuser', last_login: '2026-01-01T00:00:00.000Z' });

		expect(ids(sortFriendsForChallenge([older, newer], []))).toEqual(['n', 'o']);
	});

	it('sorts missing or PRIVATE last_login after visible entries, then alphabetically', () => {
		const visible = friend({
			id: 'v',
			username: 'zvisible',
			last_login: '2020-01-01T00:00:00.000Z'
		});
		const priv = friend({
			id: 'p',
			username: 'aprivate',
			last_login: '2026-01-01T00:00:00.000Z',
			lastLoginPrivacy: 'PRIVATE'
		});
		const missing = friend({ id: 'm', username: 'amissing' });

		// visible first (real login); then the two unknowns alpha-sorted (amissing < aprivate)
		expect(ids(sortFriendsForChallenge([priv, missing, visible], []))).toEqual(['v', 'm', 'p']);
	});

	it('honors MUTUAL privacy: last_login is hidden unless the friend is mutual', () => {
		const mutualVisible = friend({
			id: 'a',
			username: 'auser',
			last_login: '2026-01-01T00:00:00.000Z',
			lastLoginPrivacy: 'MUTUAL',
			is_mutual: true
		});
		const mutualHidden = friend({
			id: 'b',
			username: 'buser',
			last_login: '2026-06-01T00:00:00.000Z',
			lastLoginPrivacy: 'MUTUAL',
			is_mutual: false
		});

		// b logged in more recently but is not mutual, so its login is unknown and sorts last
		expect(ids(sortFriendsForChallenge([mutualHidden, mutualVisible], []))).toEqual(['a', 'b']);
	});

	it('honors CIRCLE privacy: last_login is hidden unless the friend is in my circle', () => {
		const circleHidden = friend({
			id: 'a',
			username: 'auser',
			last_login: '2026-06-01T00:00:00.000Z',
			lastLoginPrivacy: 'CIRCLE',
			is_in_my_circle: false
		});
		const publicVisible = friend({
			id: 'b',
			username: 'buser',
			last_login: '2026-01-01T00:00:00.000Z',
			lastLoginPrivacy: 'PUBLIC'
		});

		// neither is in my circle, so circleHidden's login is unknown and sorts after the public one
		expect(ids(sortFriendsForChallenge([circleHidden, publicVisible], []))).toEqual(['b', 'a']);
	});

	it('breaks ties alphabetically by username, case-insensitively', () => {
		const zebra = friend({ id: 'z', username: 'Zebra' });
		const apple = friend({ id: 'a', username: 'apple' });

		// case-insensitive: apple precedes Zebra (a raw ASCII compare would flip them)
		expect(sortFriendsForChallenge([zebra, apple], []).map((r) => r.user.username)).toEqual([
			'apple',
			'Zebra'
		]);
	});

	it('tags the most-recently-added friend still present in the list', () => {
		const f1 = friend({ id: 'id1', username: 'one' });
		const f2 = friend({ id: 'id2', username: 'two' });

		// added id1, id2, id3 in that order; id3 was since removed from the list
		const rows = sortFriendsForChallenge([f1, f2], ['id1', 'id2', 'id3']);

		expect(rows.filter((r) => r.recommended).map((r) => r.user.id)).toEqual(['id2']);
	});

	it('tags the recommended friend without reordering the sort', () => {
		const circleUser = friend({ id: 'c', username: 'circle', is_in_my_circle: true });
		const plain = friend({ id: 'p', username: 'plain' });

		// recommend the non-circle friend; circle-first ordering must still win
		const rows = sortFriendsForChallenge([plain, circleUser], ['c', 'p']);

		expect(ids(rows)).toEqual(['c', 'p']);
		expect(rows.find((r) => r.recommended)?.user.id).toBe('p');
	});

	it('tags no friend when the current user has no friends array', () => {
		const f1 = friend({ id: 'id1', username: 'one' });
		const f2 = friend({ id: 'id2', username: 'two' });

		expect(sortFriendsForChallenge([f1, f2], []).some((r) => r.recommended)).toBe(false);
	});

	it('tolerates empty and nullish input', () => {
		expect(sortFriendsForChallenge([], ['id1'])).toEqual([]);
		expect(sortFriendsForChallenge(undefined as unknown as User[], null)).toEqual([]);
	});
});

describe('pickRecommendedFriendId', () => {
	const f1 = friend({ id: 'id1', username: 'one' });
	const f2 = friend({ id: 'id2', username: 'two' });

	it('returns the last added id that still appears in the friends list', () => {
		expect(pickRecommendedFriendId([f1, f2], ['id1', 'id2'])).toBe('id2');
	});

	it('respects the add-order array, not the friends-list order', () => {
		expect(pickRecommendedFriendId([f1, f2], ['id2', 'id1'])).toBe('id1');
	});

	it('returns null when no added id is present in the list', () => {
		expect(pickRecommendedFriendId([f1], ['id2', 'id3'])).toBeNull();
	});

	it('returns null for empty or missing add-order', () => {
		expect(pickRecommendedFriendId([f1], [])).toBeNull();
		expect(pickRecommendedFriendId([f1], null)).toBeNull();
		expect(pickRecommendedFriendId([f1], undefined)).toBeNull();
	});
});
