import { beforeEach, describe, expect, it, vi } from 'vitest';

// the composable binds the native 'NativePurchases' plugin through @capacitor/core's
// registerPlugin (the @capgo/native-purchases native impl arrives via `cap sync`), so the
// plugin boundary is mocked here at registerPlugin. the pure helpers under test need neither.
const mocks = vi.hoisted(() => ({
	platform: 'web',
	native: false,
	plugin: {
		getProducts: vi.fn(async () => ({ products: [] as { identifier: string }[] })),
		purchaseProduct: vi.fn(async () => ({ transactionId: 't1' })),
		restorePurchases: vi.fn(async () => {}),
		getPurchases: vi.fn(async () => ({ purchases: [] })),
		getPluginVersion: vi.fn(async () => ({ version: '8.6.5' })),
		isBillingSupported: vi.fn(async () => ({ isBillingSupported: true })),
		getStorefront: vi.fn(async () => ({ countryCode: 'USA' })),
		getAppTransaction: vi.fn(async () => ({
			appTransaction: { bundleId: 'com.earthapp.sky', environment: 'Sandbox' }
		}))
	},
	appPlugin: {
		getInfo: vi.fn(async () => ({
			id: 'com.earthapp.sky',
			name: 'The Earth App',
			build: '1',
			version: '1.0.3'
		}))
	},
	identityPlugin: {
		getAppTransaction: vi.fn(async () => ({
			bundleId: 'com.earthapp.sky',
			environment: 'Sandbox',
			appId: '6771985151',
			verified: true
		})),
		refreshAppTransaction: vi.fn(async () => ({
			bundleId: 'com.earthapp.sky',
			environment: 'Sandbox',
			appId: '6771985151',
			verified: true
		}))
	}
}));

vi.mock('@capacitor/core', () => ({
	Capacitor: {
		isNativePlatform: () => mocks.native,
		getPlatform: () => mocks.platform
	},
	// dispatch by name: diagnose() binds @capacitor/app for the binary's own bundle id, and the
	// sky-owned StoreKitIdentity plugin for the app transaction
	registerPlugin: (name: string) => {
		if (name === 'App') return mocks.appPlugin;
		if (name === 'StoreKitIdentity') return mocks.identityPlugin;
		return mocks.plugin;
	}
}));

// partial: crust's websocket plugin pulls makeServerRequest from the same module on a timer
vi.mock('utils', async (importOriginal) => ({
	...(await importOriginal<typeof import('utils')>()),
	makeClientAPIRequest: vi.fn(async () => ({ success: true, data: { tier: 'PRO' } }))
}));

const useAuthStore = vi.fn(() => ({ sessionToken: 'token' }));
vi.stubGlobal('useAuthStore', useAuthStore);

import {
	ANDROID_PACKAGE_NAME,
	classifyAvailability,
	formatIapDiagnostics,
	IAP_PRODUCT_IDS,
	type IapDiagnostics,
	type IapTransaction,
	mapPurchaseError,
	mapTransactionToVerifyBody,
	pickRestorablePurchase,
	PRODUCT_UNAVAILABLE_MESSAGE,
	productIdForTier,
	providerForPlatform,
	summarizeAvailability,
	tierForProductId,
	useIapPurchase,
	verifyPathForPlatform
} from '~/composables/useIapPurchase';

const IOS_IDS = [
	'com.earthapp.sky.pro.monthly',
	'com.earthapp.sky.writer.monthly',
	'com.earthapp.sky.organizer.monthly'
];

function baseDiagnostics(overrides: Partial<IapDiagnostics> = {}): IapDiagnostics {
	return {
		platform: 'ios',
		native: true,
		pluginVersion: '8.6.5',
		billingSupported: true,
		storefront: 'USA',
		environment: 'Sandbox',
		bundleId: 'com.earthapp.sky',
		localBundleId: 'com.earthapp.sky',
		appId: '6771985151',
		requestedProductIds: IOS_IDS,
		availableProductIds: IOS_IDS,
		missingProductIds: [],
		errors: {},
		...overrides
	};
}

beforeEach(() => {
	mocks.platform = 'web';
	mocks.native = false;
	vi.clearAllMocks();
	mocks.plugin.getProducts.mockResolvedValue({ products: [] });
	mocks.plugin.purchaseProduct.mockResolvedValue({ transactionId: 't1' });
	mocks.plugin.getPluginVersion.mockResolvedValue({ version: '8.6.5' });
	mocks.plugin.isBillingSupported.mockResolvedValue({ isBillingSupported: true });
	mocks.plugin.getStorefront.mockResolvedValue({ countryCode: 'USA' });
	mocks.plugin.getAppTransaction.mockResolvedValue({
		appTransaction: { bundleId: 'com.earthapp.sky', environment: 'Sandbox' }
	});
	mocks.appPlugin.getInfo.mockResolvedValue({
		id: 'com.earthapp.sky',
		name: 'The Earth App',
		build: '1',
		version: '1.0.3'
	});
	const appTransaction = {
		bundleId: 'com.earthapp.sky',
		environment: 'Sandbox',
		appId: '6771985151',
		verified: true
	};
	mocks.identityPlugin.getAppTransaction.mockResolvedValue(appTransaction);
	mocks.identityPlugin.refreshAppTransaction.mockResolvedValue(appTransaction);
});

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
			productMissing: false,
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
			productMissing: false,
			message: 'Network unavailable'
		});
	});

	it('falls back to a generic message when the error is empty', () => {
		expect(mapPurchaseError(undefined)).toEqual({
			cancelled: false,
			productMissing: false,
			message: 'The purchase could not be completed.'
		});
	});

	// the plugin names the product id in its reject string, which must never reach a toast
	it('flags the plugin unknown-product reject', () => {
		const mapped = mapPurchaseError(
			new Error('Cannot find product for id com.earthapp.sky.pro.monthly')
		);
		expect(mapped.productMissing).toBe(true);
		expect(mapped.cancelled).toBe(false);
	});

	it('flags the play unavailable-item code', () => {
		expect(mapPurchaseError(new Error('ITEM_UNAVAILABLE')).productMissing).toBe(true);
	});

	it('does not confuse a cancellation with a missing product', () => {
		expect(mapPurchaseError(new Error('cancelled')).productMissing).toBe(false);
	});
});

describe('summarizeAvailability', () => {
	it('derives the missing set, because the store drops unknown ids silently', () => {
		expect(summarizeAvailability(IOS_IDS, [{ identifier: IOS_IDS[0] }] as never)).toEqual({
			available: [IOS_IDS[0]],
			missing: [IOS_IDS[1], IOS_IDS[2]]
		});
	});

	it('reports everything missing for an empty response', () => {
		expect(summarizeAvailability(IOS_IDS, [])).toEqual({ available: [], missing: IOS_IDS });
	});

	it('ignores a product the store returned that was never requested', () => {
		expect(summarizeAvailability([IOS_IDS[0]], [{ identifier: 'other' }] as never)).toEqual({
			available: [],
			missing: [IOS_IDS[0]]
		});
	});
});

describe('classifyAvailability', () => {
	it('passes a healthy catalogue', () => {
		expect(classifyAvailability(baseDiagnostics())).toBe('ok');
	});

	it('stays quiet off-device', () => {
		expect(classifyAvailability(baseDiagnostics({ native: false }))).toBe('not_native');
	});

	it('reports unsupported billing', () => {
		expect(classifyAvailability(baseDiagnostics({ billingSupported: false }))).toBe(
			'billing_unsupported'
		);
	});

	// a local .storekit file means app store connect was never consulted, so nothing else is real
	it('reports a local storekit configuration ahead of any product result', () => {
		expect(
			classifyAvailability(
				baseDiagnostics({
					environment: 'Xcode',
					missingProductIds: IOS_IDS,
					availableProductIds: []
				})
			)
		).toBe('local_storekit_config');
	});

	it('separates an account-level miss from a per-product one', () => {
		expect(
			classifyAvailability(baseDiagnostics({ missingProductIds: IOS_IDS, availableProductIds: [] }))
		).toBe('all_products_missing');
		expect(
			classifyAvailability(
				baseDiagnostics({
					missingProductIds: [IOS_IDS[2]],
					availableProductIds: [IOS_IDS[0], IOS_IDS[1]]
				})
			)
		).toBe('some_products_missing');
	});

	// the shipped v1.0.3 diagnostic: storefront USA, billing supported, all three dropped, and a
	// failed app transaction. blaming App Store Connect there sends you to the wrong system
	it('blames the app identity, not the account, when the app transaction failed', () => {
		expect(
			classifyAvailability(
				baseDiagnostics({
					environment: null,
					bundleId: null,
					missingProductIds: IOS_IDS,
					availableProductIds: [],
					errors: { appTransaction: 'Failed to get app transaction: Unable to Complete Request' }
				})
			)
		).toBe('no_app_identity');
	});

	it('still reads account-level when the app transaction succeeded', () => {
		expect(
			classifyAvailability(baseDiagnostics({ missingProductIds: IOS_IDS, availableProductIds: [] }))
		).toBe('all_products_missing');
	});

	// an unrelated api failing must not hijack the verdict
	it('ignores a failure in a different call', () => {
		expect(
			classifyAvailability(
				baseDiagnostics({
					missingProductIds: IOS_IDS,
					availableProductIds: [],
					errors: { pluginVersion: 'boom' }
				})
			)
		).toBe('all_products_missing');
	});

	it('blames the missing storefront before the products', () => {
		expect(
			classifyAvailability(
				baseDiagnostics({ storefront: null, missingProductIds: IOS_IDS, availableProductIds: [] })
			)
		).toBe('no_storefront');
	});
});

describe('formatIapDiagnostics', () => {
	it('leads with the verdict and carries every field needed to act on it', () => {
		const report = formatIapDiagnostics(
			baseDiagnostics({ missingProductIds: IOS_IDS, availableProductIds: [] })
		);
		expect(report.startsWith('verdict: all_products_missing')).toBe(true);
		expect(report).toContain('bundle id (app store): com.earthapp.sky');
		expect(report).toContain('bundle id (binary): com.earthapp.sky');
		expect(report).toContain('environment: Sandbox');
		expect(report).toContain('storefront: USA');
		expect(report).toContain(IOS_IDS[0]);
	});

	it('includes a failed api call rather than dropping it', () => {
		const report = formatIapDiagnostics(
			baseDiagnostics({ errors: { appTransaction: 'requires iOS 16.0 or later' } })
		);
		expect(report).toContain('error (appTransaction): requires iOS 16.0 or later');
	});

	it('prints unknowns as unknown instead of inventing a value', () => {
		const report = formatIapDiagnostics(
			baseDiagnostics({
				environment: null,
				bundleId: null,
				localBundleId: null,
				storefront: null
			})
		);
		expect(report).toContain('environment: unknown');
		expect(report).toContain('bundle id (app store): unknown');
		expect(report).toContain('storefront: none');
	});

	// the app-store bundle id dies with the app transaction; the binary's own must survive it
	it('keeps the binary bundle id when the app transaction failed', () => {
		const report = formatIapDiagnostics(
			baseDiagnostics({
				environment: null,
				bundleId: null,
				errors: { appTransaction: 'Unable to Complete Request' }
			})
		);
		expect(report).toContain('bundle id (app store): unknown');
		expect(report).toContain('bundle id (binary): com.earthapp.sky');
	});
});

describe('diagnose (plugin boundary)', () => {
	it('returns a not-native snapshot without touching the plugin', async () => {
		const { diagnose } = useIapPurchase();
		const result = await diagnose();
		expect(result.native).toBe(false);
		expect(result.requestedProductIds).toEqual([]);
		expect(mocks.plugin.getProducts).not.toHaveBeenCalled();
	});

	it('captures every store answer in one pass', async () => {
		mocks.native = true;
		mocks.platform = 'ios';
		mocks.plugin.getProducts.mockResolvedValue({
			products: IOS_IDS.map((identifier) => ({ identifier }))
		});

		const { diagnose } = useIapPurchase();
		const result = await diagnose();

		expect(result.pluginVersion).toBe('8.6.5');
		expect(result.billingSupported).toBe(true);
		expect(result.storefront).toBe('USA');
		expect(result.environment).toBe('Sandbox');
		expect(result.bundleId).toBe('com.earthapp.sky');
		expect(result.localBundleId).toBe('com.earthapp.sky');
		expect(result.missingProductIds).toEqual([]);
		expect(classifyAvailability(result)).toBe('ok');
	});

	// one rejecting api must not blind the other four, or the report loses the cause
	it('records a failing call and keeps the rest of the snapshot', async () => {
		mocks.native = true;
		mocks.platform = 'ios';
		mocks.identityPlugin.getAppTransaction.mockRejectedValue(
			new Error('App Transaction requires iOS 16.0 or later')
		);

		const { diagnose } = useIapPurchase();
		const result = await diagnose();

		expect(result.errors.appTransaction).toContain('iOS 16.0');
		expect(result.storefront).toBe('USA');
		expect(result.localBundleId).toBe('com.earthapp.sky');
		expect(result.missingProductIds).toEqual(IOS_IDS);
		expect(classifyAvailability(result)).toBe('no_app_identity');
	});

	it('reports every id missing when the store returns nothing', async () => {
		mocks.native = true;
		mocks.platform = 'ios';
		const { diagnose } = useIapPurchase();
		const result = await diagnose();
		expect(result.availableProductIds).toEqual([]);
		expect(result.missingProductIds).toEqual(IOS_IDS);
	});
});

// Apple's documented remedy when AppTransaction.shared throws. it presents a sign-in sheet, so it
// must stay an explicit user action - the composable never calls it from diagnose()
describe('refreshAppIdentity', () => {
	it('refuses off iOS rather than calling a plugin that does not exist there', async () => {
		mocks.native = true;
		mocks.platform = 'android';
		const { refreshAppIdentity } = useIapPurchase();
		const result = await refreshAppIdentity();
		expect(result.ok).toBe(false);
		expect(mocks.identityPlugin.refreshAppTransaction).not.toHaveBeenCalled();
	});

	it('reports success once the store re-issues the app transaction', async () => {
		mocks.native = true;
		mocks.platform = 'ios';
		const { refreshAppIdentity } = useIapPurchase();
		expect(await refreshAppIdentity()).toEqual({ ok: true });
	});

	// a cancelled sign-in sheet rejects; that must read as "not fixed", not as a crash
	it('surfaces the failure instead of throwing', async () => {
		mocks.native = true;
		mocks.platform = 'ios';
		mocks.identityPlugin.refreshAppTransaction.mockRejectedValue(new Error('User cancelled'));
		const { refreshAppIdentity } = useIapPurchase();
		const result = await refreshAppIdentity();
		expect(result.ok).toBe(false);
		expect(result.error).toBeTruthy();
	});

	it('treats a transaction with no bundle id as unresolved', async () => {
		mocks.native = true;
		mocks.platform = 'ios';
		mocks.identityPlugin.refreshAppTransaction.mockResolvedValue({} as never);
		const { refreshAppIdentity } = useIapPurchase();
		expect((await refreshAppIdentity()).ok).toBe(false);
	});
});

describe('purchase preflight', () => {
	it('refuses without calling purchaseProduct when the store has no such product', async () => {
		mocks.native = true;
		mocks.platform = 'ios';

		const { purchase } = useIapPurchase();
		const result = await purchase('PRO');

		expect(result).toEqual({
			success: false,
			reason: 'product_unavailable',
			error: PRODUCT_UNAVAILABLE_MESSAGE
		});
		expect(mocks.plugin.purchaseProduct).not.toHaveBeenCalled();
	});

	it('proceeds once the store resolves the product', async () => {
		mocks.native = true;
		mocks.platform = 'ios';
		mocks.plugin.getProducts.mockResolvedValue({
			products: [{ identifier: 'com.earthapp.sky.pro.monthly' }]
		});

		const { purchase } = useIapPurchase();
		const result = await purchase('PRO');

		expect(mocks.plugin.purchaseProduct).toHaveBeenCalledWith({
			productIdentifier: 'com.earthapp.sky.pro.monthly',
			productType: 'subs'
		});
		expect(result.success).toBe(true);
	});

	// a preflight that itself fails must not block a purchase that would have worked
	it('falls through to the purchase when the preflight throws', async () => {
		mocks.native = true;
		mocks.platform = 'ios';
		mocks.plugin.getProducts.mockRejectedValue(new Error('network'));

		const { purchase } = useIapPurchase();
		await purchase('PRO');

		expect(mocks.plugin.purchaseProduct).toHaveBeenCalled();
	});

	it('maps the plugin unknown-product reject to the human message', async () => {
		mocks.native = true;
		mocks.platform = 'ios';
		mocks.plugin.getProducts.mockResolvedValue({
			products: [{ identifier: 'com.earthapp.sky.pro.monthly' }]
		});
		mocks.plugin.purchaseProduct.mockRejectedValue(
			new Error('Cannot find product for id com.earthapp.sky.pro.monthly')
		);

		const { purchase } = useIapPurchase();
		const result = await purchase('PRO');

		expect(result.reason).toBe('product_unavailable');
		expect(result.error).toBe(PRODUCT_UNAVAILABLE_MESSAGE);
		expect(result.error).not.toContain('com.earthapp.sky');
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
