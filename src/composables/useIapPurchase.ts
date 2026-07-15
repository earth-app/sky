import { Capacitor, registerPlugin } from '@capacitor/core';
import type { AccountType } from 'types/user';
import { makeClientAPIRequest } from 'utils';

// billing provider behind each mobile platform
export type IapProvider = 'apple' | 'google';
// only ios/android can buy; 'web' and unknown platforms are non-purchasable
export type IapPlatform = 'ios' | 'android';

export const IAP_PRODUCT_IDS: Record<IapPlatform, Partial<Record<AccountType, string>>> = {
	ios: {
		PRO: 'com.earthapp.sky.pro.monthly',
		WRITER: 'com.earthapp.sky.writer.monthly',
		ORGANIZER: 'com.earthapp.sky.organizer.monthly'
	},
	android: {
		PRO: 'sky_pro_monthly',
		WRITER: 'sky_writer_monthly',
		ORGANIZER: 'sky_organizer_monthly'
	}
};

// Play Developer API requires the package name alongside the purchase token
export const ANDROID_PACKAGE_NAME = 'com.earthapp.sky';

export interface IapTransaction {
	transactionId?: string;
	productIdentifier?: string;
	jwsRepresentation?: string;
	receipt?: string;
	purchaseToken?: string;
	orderId?: string;
	isActive?: boolean;
	expirationDate?: string | number;
}

export interface IapProduct {
	identifier: string;
	title: string;
	description: string;
	priceString: string;
	currencyCode: string;
}

// subset of the @capgo/native-purchases surface we call. we bind the plugin by NAME through
// @capacitor/core's registerPlugin rather than importing the wrapper, so the web/test build
// never has to resolve the native package (it is still installed for the native binary via
// `cap sync`; the JS wrapper is just optional sugar over this same bridge).
interface NativePurchasesPlugin {
	getProducts(options: {
		productIdentifiers: string[];
		productType?: string;
	}): Promise<{ products: IapProduct[] }>;
	purchaseProduct(options: {
		productIdentifier: string;
		productType?: string;
		quantity?: number;
	}): Promise<IapTransaction>;
	restorePurchases(): Promise<void>;
	getPurchases(options?: { productType?: string }): Promise<{ purchases: IapTransaction[] }>;
}

// mirrors @capgo/native-purchases PURCHASE_TYPE.SUBS
const PURCHASE_TYPE_SUBS = 'subs';

let nativePurchases: NativePurchasesPlugin | null = null;
function getNativePurchases(): NativePurchasesPlugin {
	if (!nativePurchases) {
		nativePurchases = registerPlugin<NativePurchasesPlugin>('NativePurchases');
	}
	return nativePurchases;
}

export interface AppleVerifyBody {
	transaction_id: string;
	product_id: string;
	signed_payload: string;
}

export interface GoogleVerifyBody {
	purchase_token: string;
	product_id: string;
	package_name: string;
}

// mirrors mantle2's subscription STATUS SHAPE (canonical type lands in crust types/subscription)
export interface IapSubscriptionStatus {
	tier: string;
	status: string;
	provider: string | null;
	current_period_end: string | null;
	cancel_at_period_end: boolean;
	is_trial: boolean;
	trial_end: string | null;
	refund_eligible: boolean;
	refund_deadline: string | null;
	can_manage_billing: boolean;
}

export type IapPurchaseReason =
	| 'unavailable'
	| 'cancelled'
	| 'purchase_failed'
	| 'restore_failed'
	| 'nothing_to_restore'
	| 'verify_failed';

export interface IapPurchaseResult {
	success: boolean;
	status?: IapSubscriptionStatus;
	reason?: IapPurchaseReason;
	error?: string;
	code?: number;
}

// ---- pure helpers (unit-testable; no plugin / no I/O) ---------------------

function normalizeTier(tier: AccountType | string): string {
	return String(tier).toUpperCase();
}

export function productIdForTier(platform: IapPlatform, tier: AccountType | string): string | null {
	return IAP_PRODUCT_IDS[platform][normalizeTier(tier) as AccountType] ?? null;
}

export function tierForProductId(platform: IapPlatform, productId: string): AccountType | null {
	const map = IAP_PRODUCT_IDS[platform];
	for (const key of Object.keys(map) as AccountType[]) {
		if (map[key] === productId) return key;
	}
	return null;
}

export function providerForPlatform(platform: string): IapProvider | null {
	if (platform === 'ios') return 'apple';
	if (platform === 'android') return 'google';
	return null;
}

export function verifyPathForPlatform(platform: string): string | null {
	const provider = providerForPlatform(platform);
	return provider ? `/v2/subscriptions/iap/${provider}/verify` : null;
}

// map a native purchase into the provider-specific verify body the backend expects
export function mapTransactionToVerifyBody(
	provider: IapProvider,
	productId: string,
	tx: IapTransaction
): AppleVerifyBody | GoogleVerifyBody {
	const resolvedProduct = productId || String(tx.productIdentifier ?? '');
	if (provider === 'apple') {
		return {
			transaction_id: String(tx.transactionId ?? ''),
			product_id: resolvedProduct,
			// storekit 2 JWS; fall back to a legacy receipt if the plugin only supplied that
			signed_payload: String(tx.jwsRepresentation ?? tx.receipt ?? '')
		};
	}
	return {
		purchase_token: String(tx.purchaseToken ?? ''),
		product_id: resolvedProduct,
		package_name: ANDROID_PACKAGE_NAME
	};
}

// distinguish a user-cancelled purchase (silent) from a real failure (toast)
export function mapPurchaseError(err: unknown): { cancelled: boolean; message: string } {
	const message =
		err instanceof Error
			? err.message
			: typeof err === 'string'
				? err
				: String((err as { message?: unknown } | null)?.message ?? err ?? '');
	const code = String((err as { code?: unknown } | null)?.code ?? '');
	// storekit userCancelled = 2; play BILLING_RESPONSE_RESULT_USER_CANCELED / message text
	const cancelled = /cancel/i.test(message) || /cancel/i.test(code) || code === '2';
	return {
		cancelled,
		message: cancelled ? 'Purchase canceled.' : message || 'The purchase could not be completed.'
	};
}

// pick the purchase to re-verify on restore: prefer an active sub, else the last one seen
export function pickRestorablePurchase(purchases: IapTransaction[]): IapTransaction | null {
	if (!purchases || purchases.length === 0) return null;
	const active = purchases.find((p) => p.isActive);
	return active ?? purchases[purchases.length - 1] ?? null;
}

// ---- composable ------------------------------------------------------------

export function useIapPurchase() {
	const authStore = useAuthStore();

	function currentPlatform(): string {
		return Capacitor.getPlatform();
	}

	function isNative(): boolean {
		return Capacitor.isNativePlatform();
	}

	// true when the tier maps to a real product on the current native platform
	function canPurchase(tier: AccountType | string): boolean {
		const platform = currentPlatform();
		if (platform !== 'ios' && platform !== 'android') return false;
		return productIdForTier(platform, tier) != null;
	}

	function unavailableResult(): IapPurchaseResult {
		return {
			success: false,
			reason: 'unavailable',
			error: 'In-app purchases are only available in the mobile app.'
		};
	}

	async function verifyTransaction(
		provider: IapProvider,
		path: string,
		productId: string,
		tx: IapTransaction
	): Promise<IapPurchaseResult> {
		const body = mapTransactionToVerifyBody(provider, productId, tx);
		const res = await makeClientAPIRequest<IapSubscriptionStatus>(path, authStore.sessionToken, {
			method: 'POST',
			body
		});
		if (res.success && res.data) {
			return { success: true, status: res.data };
		}
		return { success: false, reason: 'verify_failed', error: res.message, code: res.status };
	}

	async function fetchProducts(): Promise<IapProduct[]> {
		const platform = currentPlatform();
		if (!isNative() || (platform !== 'ios' && platform !== 'android')) return [];
		const ids = Object.values(IAP_PRODUCT_IDS[platform]).filter(Boolean) as string[];
		if (ids.length === 0) return [];
		try {
			const { products } = await getNativePurchases().getProducts({
				productIdentifiers: ids,
				productType: PURCHASE_TYPE_SUBS
			});
			return products ?? [];
		} catch (error) {
			console.error('[iap] failed to load products:', error);
			return [];
		}
	}

	async function purchase(tier: AccountType | string): Promise<IapPurchaseResult> {
		if (!isNative()) return unavailableResult();
		const platform = currentPlatform();
		const provider = providerForPlatform(platform);
		const path = verifyPathForPlatform(platform);
		const productId =
			platform === 'ios' || platform === 'android' ? productIdForTier(platform, tier) : null;
		if (!provider || !path || !productId) {
			return {
				success: false,
				reason: 'unavailable',
				error: 'This plan is not available for purchase on this device.'
			};
		}

		let tx: IapTransaction;
		try {
			tx = await getNativePurchases().purchaseProduct({
				productIdentifier: productId,
				productType: PURCHASE_TYPE_SUBS
			});
		} catch (error) {
			const mapped = mapPurchaseError(error);
			return {
				success: false,
				reason: mapped.cancelled ? 'cancelled' : 'purchase_failed',
				error: mapped.message
			};
		}

		return await verifyTransaction(provider, path, productId, tx);
	}

	async function restore(): Promise<IapPurchaseResult> {
		if (!isNative()) return unavailableResult();
		const platform = currentPlatform();
		const provider = providerForPlatform(platform);
		const path = verifyPathForPlatform(platform);
		if (!provider || !path) return unavailableResult();

		let purchases: IapTransaction[];
		try {
			const plugin = getNativePurchases();
			await plugin.restorePurchases();
			const result = await plugin.getPurchases({ productType: PURCHASE_TYPE_SUBS });
			purchases = result?.purchases ?? [];
		} catch (error) {
			const mapped = mapPurchaseError(error);
			return { success: false, reason: 'restore_failed', error: mapped.message };
		}

		const tx = pickRestorablePurchase(purchases);
		if (!tx) {
			return {
				success: false,
				reason: 'nothing_to_restore',
				error: 'No previous purchase was found to restore.'
			};
		}
		const productId = String(tx.productIdentifier ?? '');
		return await verifyTransaction(provider, path, productId, tx);
	}

	return {
		isNative,
		currentPlatform,
		canPurchase,
		fetchProducts,
		purchase,
		restore
	};
}
