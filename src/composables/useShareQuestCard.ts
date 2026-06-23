import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Toast } from '@capacitor/toast';

const SHARE_BASE = 'https://app.earth-app.com';

interface ShareQuestCardArgs {
	userId: string;
	questId: string;
	questTitle?: string;
	points?: number;
}

export function useShareQuestCard() {
	const config = useRuntimeConfig();
	const apiBase = (config.public.apiBaseUrl || 'https://api.earth-app.com').replace(/\/+$/, '');

	function buildShareUrl(questId: string, userId: string, code?: string): string {
		const base = `${SHARE_BASE}/share/quest/${questId}?u=${encodeURIComponent(userId)}`;
		return code ? `${base}&ref=${encodeURIComponent(code)}` : base;
	}

	function buildText(questTitle?: string, points?: number): string {
		const title = questTitle || 'a quest';
		return points
			? `I just completed "${title}" on The Earth App, earned ${points} Impact Points!`
			: `I just completed "${title}" on The Earth App!`;
	}

	// useReferral is inherited from crust; the published build may predate it, so
	// resolve defensively: share without a ref code rather than throwing. the
	// direct reference may read as unresolved until crust is republished + bumped.
	async function resolveReferralCode(): Promise<string | undefined> {
		try {
			const fn = (useReferral as undefined | (() => { fetchCode?: () => Promise<string> }))?.();
			const code = await fn?.fetchCode?.();
			return code ?? undefined;
		} catch {
			return undefined;
		}
	}

	async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
		const bytes = new Uint8Array(buffer);
		let binary = '';
		const chunk = 0x8000;
		for (let i = 0; i < bytes.length; i += chunk) {
			binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
		}
		return btoa(binary);
	}

	async function shareLinkOnly(args: ShareQuestCardArgs, code?: string): Promise<void> {
		await Share.share({
			title: 'Quest Complete',
			text: buildText(args.questTitle, args.points),
			url: buildShareUrl(args.questId, args.userId, code),
			dialogTitle: 'Share Your Quest Win'
		});
	}

	async function shareQuestCard(args: ShareQuestCardArgs): Promise<void> {
		if (!(await Share.canShare())) {
			await Toast.show({ text: 'Sharing is not supported on this device.', duration: 'short' });
			return;
		}

		const code = await resolveReferralCode();
		const url = buildShareUrl(args.questId, args.userId, code);
		const text = buildText(args.questTitle, args.points);

		try {
			const res = await $fetch.raw(
				`${apiBase}/v2/users/${args.userId}/share/quest/${args.questId}`,
				{ responseType: 'arrayBuffer' }
			);
			const buffer = res._data as ArrayBuffer;
			if (!buffer || buffer.byteLength === 0) throw new Error('empty image');

			const base64 = await arrayBufferToBase64(buffer);
			const fileName = `quest-${args.questId}-${Date.now()}.png`;
			await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
			const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });

			await Share.share({
				title: 'Quest Complete',
				text,
				url,
				files: [uri],
				dialogTitle: 'Share Your Quest Win'
			});
			await Toast.show({ text: 'Shared your achievement!', duration: 'short' });
		} catch {
			// image path failed (offline, fetch error, no filesystem); share the link instead
			try {
				await shareLinkOnly(args, code);
			} catch {
				// the share sheet itself was dismissed or unavailable; stay quiet on cancel
				return;
			}
		}
	}

	const isNative = Capacitor.isNativePlatform();

	return { shareQuestCard, buildShareUrl, isNative };
}
