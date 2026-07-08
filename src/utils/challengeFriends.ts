import type { Privacy, User } from 'types/user';

export type ChallengeFriendRow = {
	user: User;
	recommended: boolean;
};

// last_login is visible to the viewer only when the friend's privacy setting allows it
// given the viewer's relationship (mutual friend / in my circle)
function lastLoginVisible(friend: User): boolean {
	const privacy = friend.account?.field_privacy?.last_login as Privacy | undefined;
	switch (privacy) {
		case 'PRIVATE':
			return false;
		case 'MUTUAL':
			return friend.is_mutual === true;
		case 'CIRCLE':
			return friend.is_in_my_circle === true;
		default:
			// PUBLIC or unset -> visible
			return true;
	}
}

// numeric last_login timestamp, or null when missing / invalid / hidden by privacy
function effectiveLastLogin(friend: User): number | null {
	if (!friend.last_login || !lastLoginVisible(friend)) return null;
	const t = Date.parse(friend.last_login);
	return Number.isNaN(t) ? null : t;
}

// most-recently-added friend still present in the friends list; the current user's own
// friends[] preserves add-order (the list endpoint re-sorts by account creation)
export function pickRecommendedFriendId(
	friends: User[],
	currentUserFriendIds: readonly string[] | undefined | null
): string | null {
	if (!Array.isArray(currentUserFriendIds) || currentUserFriendIds.length === 0) return null;
	const present = new Set(friends.map((f) => f.id));
	for (let i = currentUserFriendIds.length - 1; i >= 0; i--) {
		const id = currentUserFriendIds[i];
		if (id && present.has(id)) return id;
	}
	return null;
}

// circle members first, then last_login desc (hidden/missing sorted last), then username
// asc (case-insensitive); the recommended friend is tagged, not reordered
export function sortFriendsForChallenge(
	friends: User[],
	currentUserFriendIds: readonly string[] | undefined | null = []
): ChallengeFriendRow[] {
	const list = Array.isArray(friends) ? friends.filter(Boolean) : [];
	const recommendedId = pickRecommendedFriendId(list, currentUserFriendIds);

	const sorted = [...list].sort((a, b) => {
		const aCircle = a.is_in_my_circle === true;
		const bCircle = b.is_in_my_circle === true;
		if (aCircle !== bCircle) return aCircle ? -1 : 1;

		const aTime = effectiveLastLogin(a);
		const bTime = effectiveLastLogin(b);
		if (aTime !== bTime) {
			if (aTime === null) return 1;
			if (bTime === null) return -1;
			return bTime - aTime;
		}

		const aName = (a.username ?? '').toLowerCase();
		const bName = (b.username ?? '').toLowerCase();
		return aName.localeCompare(bName);
	});

	return sorted.map((user) => ({ user, recommended: user.id === recommendedId }));
}
