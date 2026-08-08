import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above every const, so the shared spy has to be hoisted with it
const { deleteFile } = vi.hoisted(() => ({ deleteFile: vi.fn(async () => {}) }));

vi.mock('@capacitor/filesystem', () => ({
	Directory: { Data: 'DATA' },
	Encoding: { UTF8: 'utf8' },
	Filesystem: {
		deleteFile,
		readFile: vi.fn(async () => ({ data: '' })),
		writeFile: vi.fn(async () => {}),
		stat: vi.fn(async () => ({})),
		mkdir: vi.fn(async () => {})
	}
}));

import { clearCachedUser } from '../../../src/composables/useOfflineAuth';

describe('clearCachedUser', () => {
	beforeEach(() => {
		deleteFile.mockClear();
		localStorage.clear();
	});

	// the leak this exists for: getValidCachedUser() only checks that A session exists, not that it
	// belongs to the cached user, so a stale entry is served to whoever signs in next
	it('removes the localStorage fallback copy', async () => {
		localStorage.setItem('offline_user', JSON.stringify({ user: { username: 'accountA' } }));
		await clearCachedUser();
		expect(localStorage.getItem('offline_user')).toBeNull();
	});

	it('removes the filesystem copy', async () => {
		await clearCachedUser();
		expect(deleteFile).toHaveBeenCalledWith(
			expect.objectContaining({ path: 'auth/current_user.json' })
		);
	});

	// saveCachedUser writes to the file OR falls back to localStorage, so clearing only one leaves
	// the other readable
	it('clears localStorage even when the file delete throws', async () => {
		deleteFile.mockRejectedValueOnce(new Error('no such file'));
		localStorage.setItem('offline_user', JSON.stringify({ user: { username: 'accountA' } }));
		await expect(clearCachedUser()).resolves.toBeUndefined();
		expect(localStorage.getItem('offline_user')).toBeNull();
	});

	it('is safe to call when nothing was ever cached', async () => {
		deleteFile.mockRejectedValueOnce(new Error('no such file'));
		await expect(clearCachedUser()).resolves.toBeUndefined();
	});
});
