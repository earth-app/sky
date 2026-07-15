import { describe, expect, it, vi } from 'vitest';

// the composable binds the native 'NativePurchases' plugin through @capacitor/core's
// registerPlugin (the @capgo/native-purchases native impl arrives via `cap sync`), so the
// plugin boundary is mocked here at registerPlugin. the pure helpers under test need neither.
vi.mock('@capacitor/core', () => {
	const nativePurchases = {
		getProducts: vi.fn(async () => ({ products: [] })),
		purchaseProduct: vi.fn(async () => ({ transactionId: 't1' })),
		restorePurchases: vi.fn(async () => {}),
		getPurchases: vi.fn(async () => ({ purchases: [] }))
	};
	return {
		Capacitor: {
			isNativePlatform: () => false,
			getPlatform: () => 'web'
		},
		registerPlugin: () => nativePurchases
	};
});

import {
	ANDROID_PACKAGE_NAME,
	IAP_PRODUCT_IDS,
	type IapTransaction,
	mapPurchaseError,
	mapTransactionToVerifyBody,
	pickRestorablePurchase,
	productIdForTier,
	providerForPlatform,
	tierForProductId,
	verifyPathForPlatform
} from '~/composables/useIapPurchase';

describe('IAP product id map', () => {
	it('exposes exactly the three paid tiers per platform (no free/administrator)', () => {
		expect(Object.keys(IAP_PRODUCT_IDS.ios).sort()).toEqual(['ORGANIZER', 'PRO', 'WRITER']);
		expect(Object.keys(IAP_PRODUCT_IDS.android).sort()).toEqual(['ORGANIZER', 'PRO', 'WRITER']);
		expect(IAP_PRODUCT_IDS.ios.FREE).toBeUndefined();
		expect(IAP_PRODUCT_IDS.ios.ADMINISTRATOR).toBeUndefined();
	});

	it('uses the reverse-DNS convention on ios and matches the app bundle', () => {
		expect(IAP_PRODUCT_IDS.ios.PRO).toBe('com.earthapp.sky.pro.monthly');
		expect(ANDROID_PACKAGE_NAME).toBe('com.earthapp.sky');
	});
});

describe('productIdForTier', () => {
	it('maps paid tiers to the platform product id', () => {
		expect(productIdForTier('ios', 'PRO')).toBe('com.earthapp.sky.pro.monthly');
		expect(productIdForTier('ios', 'WRITER')).toBe('com.earthapp.sky.writer.monthly');
		expect(productIdForTier('android', 'ORGANIZER')).toBe('sky_organizer_monthly');
	});

	it('is case-insensitive on the tier name', () => {
		expect(productIdForTier('ios', 'pro')).toBe('com.earthapp.sky.pro.monthly');
	});

	it('returns null for non-purchasable / unknown tiers', () => {
		expect(productIdForTier('ios', 'FREE')).toBeNull();
		expect(productIdForTier('ios', 'ADMINISTRATOR')).toBeNull();
		expect(productIdForTier('ios', 'BOGUS')).toBeNull();
	});
});

describe('tierForProductId', () => {
	it('reverse-maps a known product id to its tier', () => {
		expect(tierForProductId('ios', 'com.earthapp.sky.writer.monthly')).toBe('WRITER');
		expect(tierForProductId('android', 'sky_pro_monthly')).toBe('PRO');
	});

	it('returns null for an unknown product id', () => {
		expect(tierForProductId('ios', 'com.example.unknown')).toBeNull();
	});
});

describe('providerForPlatform', () => {
	it('maps ios -> apple and android -> google, else null', () => {
		expect(providerForPlatform('ios')).toBe('apple');
		expect(providerForPlatform('android')).toBe('google');
		expect(providerForPlatform('web')).toBeNull();
		expect(providerForPlatform('electron')).toBeNull();
	});
});

describe('verifyPathForPlatform', () => {
	it('builds the provider-specific verify endpoint', () => {
		expect(verifyPathForPlatform('ios')).toBe('/v2/subscriptions/iap/apple/verify');
		expect(verifyPathForPlatform('android')).toBe('/v2/subscriptions/iap/google/verify');
		expect(verifyPathForPlatform('web')).toBeNull();
	});
});

describe('mapTransactionToVerifyBody (result mapping)', () => {
	it('builds the apple body from the storekit transaction', () => {
		const tx: IapTransaction = {
			transactionId: '2000000123',
			productIdentifier: 'com.earthapp.sky.pro.monthly',
			jwsRepresentation: 'eyJ.jws.sig'
		};
		expect(mapTransactionToVerifyBody('apple', 'com.earthapp.sky.pro.monthly', tx)).toEqual({
			transaction_id: '2000000123',
			product_id: 'com.earthapp.sky.pro.monthly',
			signed_payload: 'eyJ.jws.sig'
		});
	});

	it('falls back apple signed_payload to a legacy receipt and product_id to the tx product', () => {
		const tx: IapTransaction = {
			transactionId: '3',
			productIdentifier: 'com.earthapp.sky.writer.monthly',
			receipt: 'base64receipt'
		};
		expect(mapTransactionToVerifyBody('apple', '', tx)).toEqual({
			transaction_id: '3',
			product_id: 'com.earthapp.sky.writer.monthly',
			signed_payload: 'base64receipt'
		});
	});

	it('builds the google body from the play transaction', () => {
		const tx: IapTransaction = {
			purchaseToken: 'play-token-xyz',
			productIdentifier: 'sky_pro_monthly'
		};
		expect(mapTransactionToVerifyBody('google', 'sky_pro_monthly', tx)).toEqual({
			purchase_token: 'play-token-xyz',
			product_id: 'sky_pro_monthly',
			package_name: 'com.earthapp.sky'
		});
	});

	it('coerces missing fields to empty strings rather than undefined', () => {
		expect(mapTransactionToVerifyBody('apple', 'p', {})).toEqual({
			transaction_id: '',
			product_id: 'p',
			signed_payload: ''
		});
	});
});

describe('mapPurchaseError (error handling)', () => {
	it('flags user cancellation from message text', () => {
		expect(mapPurchaseError(new Error('The user cancelled the request'))).toEqual({
			cancelled: true,
			message: 'Purchase canceled.'
		});
	});

	it('flags user cancellation from a storekit code of 2', () => {
		expect(mapPurchaseError({ code: '2', message: 'boom' }).cancelled).toBe(true);
	});

	it('flags play user-canceled billing code', () => {
		expect(mapPurchaseError({ code: 'BILLING_RESPONSE_RESULT_USER_CANCELED' }).cancelled).toBe(
			true
		);
	});

	it('surfaces a real failure message', () => {
		expect(mapPurchaseError(new Error('Network unavailable'))).toEqual({
			cancelled: false,
			message: 'Network unavailable'
		});
	});

	it('falls back to a generic message when the error is empty', () => {
		expect(mapPurchaseError(undefined)).toEqual({
			cancelled: false,
			message: 'The purchase could not be completed.'
		});
	});
});

describe('pickRestorablePurchase', () => {
	it('prefers an active purchase', () => {
		const purchases: IapTransaction[] = [
			{ transactionId: 'a', isActive: false },
			{ transactionId: 'b', isActive: true }
		];
		expect(pickRestorablePurchase(purchases)?.transactionId).toBe('b');
	});

	it('falls back to the last purchase when none are marked active', () => {
		const purchases: IapTransaction[] = [{ transactionId: 'a' }, { transactionId: 'b' }];
		expect(pickRestorablePurchase(purchases)?.transactionId).toBe('b');
	});

	it('returns null for an empty list', () => {
		expect(pickRestorablePurchase([])).toBeNull();
	});
});
