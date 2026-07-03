import type { BrowserContext } from '@playwright/test';

export interface NativeMockOptions {
	platform?: 'ios' | 'android';
	// fake authorization payload returned by Sign in with Apple
	appleAuthorization?: Record<string, unknown>;
	// initial value HealthKitDistance.getActivityDistance reports (meters)
	healthKitDistance?: number;
	// fake result CapacitorBarcodeScanner.scanBarcode returns (food UPC by default)
	barcodeResult?: { ScanResult: string; format: number };
	// fake confirm result for @capacitor/dialog (default: accept)
	dialogConfirm?: boolean;
}

export async function installNativeMock(
	context: BrowserContext,
	options: NativeMockOptions = {}
): Promise<void> {
	const platform = options.platform ?? 'ios';
	const appleAuthorization = options.appleAuthorization ?? {
		user: 'mock-apple-user',
		identityToken: 'mock-identity-token',
		authorizationCode: 'mock-auth-code',
		email: 'apple@earth-app.com',
		givenName: 'Apple',
		familyName: 'Tester'
	};
	const healthKitDistance = options.healthKitDistance ?? 0;
	// default: a valid EAN-13 (format ordinal 9) so retail barcode steps validate
	const barcodeResult = options.barcodeResult ?? { ScanResult: '0123456789012', format: 9 };
	const dialogConfirm = options.dialogConfirm ?? true;

	await context.addInitScript(
		({ platform, appleAuthorization, healthKitDistance, barcodeResult, dialogConfirm }) => {
			const w = window as any;

			// ---- test-observable state ----------------------------------------
			w.__toasts = [];
			// pre-seed the "already saw the text-size prompt" flag so the onboarding
			// text-size sheet (MTextSizePrompt) never auto-opens over the page under test
			// and intercepts clicks; every spec would otherwise hit it on a fresh profile
			w.__prefs = { 'sky:has-seen-text-size-prompt': 'true' };
			w.__browserOpened = [];
			w.__liveActivity = { started: false, ended: false, lastContent: null };
			let hkDistance = healthKitDistance;
			w.__setHealthKitDistance = (m: number) => {
				hkDistance = m;
			};

			// a 1x1 transparent png the camera/drawing capture flows resolve to. Camera
			// returns webPath (a blob url here) + metadata so photoToFile() can build a File.
			const TINY_PNG =
				'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
			w.__cameraPhoto = { webPath: TINY_PNG, metadata: { format: 'png' } };
			w.__setCameraPhoto = (p: Record<string, unknown>) => {
				w.__cameraPhoto = p;
			};
			// fake barcode scan result; specs can change it to test format-rejection paths
			w.__barcodeResult = barcodeResult;
			w.__setBarcodeResult = (r: { ScanResult: string; format: number }) => {
				w.__barcodeResult = r;
			};
			// fake audio recording: duration ms; stopRecording resolves with a data-uri file
			w.__audioDurationMs = 12_000;
			w.__setAudioDuration = (ms: number) => {
				w.__audioDurationMs = ms;
			};
			w.__dialogConfirm = dialogConfirm;
			w.__setDialogConfirm = (v: boolean) => {
				w.__dialogConfirm = v;
			};
			// records dialog prompts shown so specs can assert confirm copy
			w.__dialogs = [];

			// ---- listener registries ------------------------------------------
			// keyed by `${pluginName}:${eventName}` -> array of callbacks
			const listeners: Record<string, Function[]> = {};
			const addListener = (plugin: string, event: string, cb: Function) => {
				const key = `${plugin}:${event}`;
				(listeners[key] ||= []).push(cb);
				return Promise.resolve({
					remove: () => {
						listeners[key] = (listeners[key] || []).filter((f) => f !== cb);
						return Promise.resolve();
					}
				});
			};
			const fire = (plugin: string, event: string, payload?: unknown) => {
				for (const cb of listeners[`${plugin}:${event}`] || []) {
					try {
						cb(payload);
					} catch (e) {
						// swallow listener errors so one bad handler can't break the test driver
						console.error('[native-mock] listener error', plugin, event, e);
					}
				}
			};

			// ---- test driver hooks --------------------------------------------
			w.__fireAppUrlOpen = (url: string) => fire('App', 'appUrlOpen', { url });
			w.__fireAppState = (isActive: boolean) => fire('App', 'appStateChange', { isActive });
			w.__firePedometer = (meas: Record<string, unknown>) =>
				fire('CapacitorPedometer', 'measurement', meas);
			// android cumulative-step counter the history path reads via getMeasurement();
			// the live listener's delta model is speed-clamped, so large jumps must go
			// through the anchor-based history path (see readPedometerHistory)
			w.__pedCumulativeSteps = 0;
			w.__setPedometerSteps = (steps: number) => {
				w.__pedCumulativeSteps = steps;
			};
			w.__fireHealthKitUpdate = () => fire('HealthKitDistance', 'healthKitUpdate', {});

			// ---- the fake Capacitor core --------------------------------------
			const noop = () => Promise.resolve();
			const plugins: Record<string, any> = {
				// @capacitor/app
				App: {
					addListener: (event: string, cb: Function) => addListener('App', event, cb),
					removeAllListeners: noop,
					getLaunchUrl: () => Promise.resolve(null),
					exitApp: noop
				},
				// @capacitor/preferences - in-memory so token + user cache round-trip
				Preferences: {
					get: ({ key }: { key: string }) =>
						Promise.resolve({ value: key in w.__prefs ? w.__prefs[key] : null }),
					set: ({ key, value }: { key: string; value: string }) => {
						w.__prefs[key] = value;
						return Promise.resolve();
					},
					remove: ({ key }: { key: string }) => {
						delete w.__prefs[key];
						return Promise.resolve();
					},
					clear: () => {
						w.__prefs = {};
						return Promise.resolve();
					},
					keys: () => Promise.resolve({ keys: Object.keys(w.__prefs) })
				},
				// @capacitor/browser - record opens, expose a finished emitter
				Browser: {
					open: ({ url }: { url: string }) => {
						w.__browserOpened.push(url);
						return Promise.resolve();
					},
					close: noop,
					addListener: (event: string, cb: Function) => addListener('Browser', event, cb)
				},
				// @capacitor/toast - record shown text (regression-tests the `/undefined` bug)
				Toast: {
					show: ({ text }: { text: string }) => {
						w.__toasts.push(text);
						return Promise.resolve();
					}
				},
				// @capacitor/haptics - harmless no-ops
				Haptics: { impact: noop, notification: noop, vibrate: noop, selectionStart: noop },
				// @capacitor/local-notifications - no-ops that report permission granted
				LocalNotifications: {
					checkPermissions: () => Promise.resolve({ display: 'granted' }),
					requestPermissions: () => Promise.resolve({ display: 'granted' }),
					schedule: noop,
					cancel: noop,
					addListener: (event: string, cb: Function) =>
						addListener('LocalNotifications', event, cb),
					createChannel: noop,
					removeAllListeners: noop
				},
				// @capacitor/motion - accel listener (drives the bike-fallback branch)
				Motion: {
					addListener: (event: string, cb: Function) => addListener('Motion', event, cb),
					removeAllListeners: noop
				},
				// @capacitor-community/apple-sign-in
				SignInWithApple: {
					authorize: () => Promise.resolve({ response: appleAuthorization })
				},
				// @capgo/capacitor-pedometer
				CapacitorPedometer: {
					// useQuestPermissions.ensureMotion gates start() on an activityRecognition
					// grant; without these two the check throws and tracking never activates
					checkPermissions: () => Promise.resolve({ activityRecognition: 'granted' }),
					requestPermissions: () => Promise.resolve({ activityRecognition: 'granted' }),
					addListener: (event: string, cb: Function) =>
						addListener('CapacitorPedometer', event, cb),
					startMeasurementUpdates: noop,
					stopMeasurementUpdates: noop,
					getMeasurement: () =>
						Promise.resolve({
							distance: 0,
							numberOfSteps: w.__pedCumulativeSteps,
							// android TYPE_STEP_COUNTER field the tracker anchors against
							cumulativeSteps: w.__pedCumulativeSteps
						}),
					removeAllListeners: noop
				},
				// custom app plugin: HealthKitDistance
				HealthKitDistance: {
					isAvailable: () => Promise.resolve({ available: true }),
					requestAuthorization: () => Promise.resolve({ granted: true }),
					getActivityDistance: () =>
						Promise.resolve({ distance: hkDistance, source: 'mock', workoutCount: 1 }),
					startObserving: () => Promise.resolve({ started: true }),
					stopObserving: noop,
					addListener: (event: string, cb: Function) => addListener('HealthKitDistance', event, cb)
				},
				// custom app plugin: DistanceLiveActivity
				DistanceLiveActivity: {
					isSupported: () => Promise.resolve({ supported: true }),
					start: (content: unknown) => {
						w.__liveActivity.started = true;
						w.__liveActivity.lastContent = content;
						return Promise.resolve({ activityId: 'mock-activity-1' });
					},
					update: (content: unknown) => {
						w.__liveActivity.lastContent = content;
						return Promise.resolve();
					},
					end: () => {
						w.__liveActivity.ended = true;
						return Promise.resolve();
					}
				},
				// @capacitor/camera - capture resolves to the fake photo (hardware is device-only)
				Camera: {
					checkPermissions: () => Promise.resolve({ camera: 'granted', photos: 'granted' }),
					requestPermissions: () => Promise.resolve({ camera: 'granted', photos: 'granted' }),
					takePhoto: () => Promise.resolve(w.__cameraPhoto),
					getPhoto: () => Promise.resolve(w.__cameraPhoto),
					pickImages: () => Promise.resolve({ photos: [w.__cameraPhoto] })
				},
				// @capacitor/geolocation - a fixed Manhattan fix
				Geolocation: {
					checkPermissions: () =>
						Promise.resolve({ location: 'granted', coarseLocation: 'granted' }),
					requestPermissions: () =>
						Promise.resolve({ location: 'granted', coarseLocation: 'granted' }),
					getCurrentPosition: () =>
						Promise.resolve({
							coords: {
								latitude: 40.785091,
								longitude: -73.968285,
								altitude: 10,
								accuracy: 5,
								altitudeAccuracy: 5,
								heading: 0,
								speed: 0
							},
							timestamp: Date.now()
						})
				},
				// @capacitor/dialog - confirm/alert; confirm result is test-driven
				Dialog: {
					alert: (opts: Record<string, unknown>) => {
						w.__dialogs.push({ kind: 'alert', ...opts });
						return Promise.resolve();
					},
					confirm: (opts: Record<string, unknown>) => {
						w.__dialogs.push({ kind: 'confirm', ...opts });
						return Promise.resolve({ value: w.__dialogConfirm });
					},
					prompt: (opts: Record<string, unknown>) => {
						w.__dialogs.push({ kind: 'prompt', ...opts });
						return Promise.resolve({ value: '', cancelled: false });
					}
				},
				// @capacitor/filesystem - read returns the inline png/audio data already in the data-uri
				Filesystem: {
					readFile: ({ path }: { path: string }) => {
						const comma = path.indexOf(',');
						const data = comma >= 0 ? path.slice(comma + 1) : path;
						return Promise.resolve({ data });
					},
					writeFile: () => Promise.resolve({ uri: 'mock://file' }),
					deleteFile: noop,
					getUri: ({ path }: { path: string }) => Promise.resolve({ uri: path })
				},
				// @capacitor/barcode-scanner - returns the fake scan result
				CapacitorBarcodeScanner: {
					scanBarcode: () => Promise.resolve(w.__barcodeResult)
				},
				// @capgo/capacitor-audio-recorder - synthesizes a recording on stop
				CapacitorAudioRecorder: {
					checkPermissions: () => Promise.resolve({ recordAudio: 'granted' }),
					requestPermissions: () => Promise.resolve({ recordAudio: 'granted' }),
					startRecording: () => Promise.resolve(),
					stopRecording: () =>
						Promise.resolve({
							// a tiny silent m4a as a data-uri; Filesystem.readFile splits on the comma
							uri: 'data:audio/mp4;base64,AAAA',
							duration: w.__audioDurationMs
						}),
					cancelRecording: noop,
					getRecordingStatus: () => Promise.resolve({ status: 'INACTIVE' }),
					getCurrentAmplitude: () => Promise.resolve({ value: 0.4 }),
					addListener: (event: string, cb: Function) =>
						addListener('CapacitorAudioRecorder', event, cb)
				},
				// @capacitor/network - always online in tests
				Network: {
					getStatus: () => Promise.resolve({ connected: true, connectionType: 'wifi' }),
					addListener: (event: string, cb: Function) => addListener('Network', event, cb),
					removeAllListeners: noop
				},
				// @capacitor/splash-screen
				SplashScreen: { show: noop, hide: noop },
				// @capacitor/status-bar
				StatusBar: {
					setStyle: noop,
					setBackgroundColor: noop,
					show: noop,
					hide: noop,
					setOverlaysWebView: noop
				},
				// @capacitor/push-notifications - permissions granted, token faked
				PushNotifications: {
					checkPermissions: () => Promise.resolve({ receive: 'granted' }),
					requestPermissions: () => Promise.resolve({ receive: 'granted' }),
					register: () => {
						// mirror native: fire a registration token shortly after register()
						setTimeout(
							() => fire('PushNotifications', 'registration', { value: 'mock-fcm-token' }),
							0
						);
						return Promise.resolve();
					},
					removeAllListeners: noop,
					addListener: (event: string, cb: Function) => addListener('PushNotifications', event, cb)
				},
				// @capacitor/share - records shares, always shareable
				Share: {
					canShare: () => Promise.resolve({ value: true }),
					share: (opts: Record<string, unknown>) => {
						w.__shares ||= [];
						w.__shares.push(opts);
						return Promise.resolve({ activityType: 'mock' });
					}
				},
				// @capgo/capacitor-watch - no paired watch in tests
				CapgoWatch: {
					getInfo: () => Promise.resolve({ isPaired: false, isReachable: false }),
					sendMessage: noop,
					transferUserInfo: noop,
					updateApplicationContext: noop,
					addListener: (event: string, cb: Function) => addListener('CapgoWatch', event, cb)
				}
			};

			// our registerPlugin returns the mock impl for a plugin (falling back to a
			// permissive proxy). the app's @capacitor/toast etc. call registerPlugin at
			// import time, so this is what actually routes their calls into the mock.
			const ourRegisterPlugin = (name: string, _impl?: unknown) =>
				plugins[name] ?? {
					// unknown plugins resolve to a permissive proxy so wrappers don't throw
					addListener: (event: string, cb: Function) => addListener(name, event, cb)
				};

			// @capacitor/core runs initCapacitorGlobal(globalThis) at MODULE IMPORT, which
			// mutates window.Capacitor and REASSIGNS registerPlugin/getPlatform to its own
			// web-platform versions - defeating a plain override. two levers keep the mock in
			// control: (1) CapacitorCustomPlatform makes core's getPlatform() report native
			// (so isNativePlatform() is true and the app takes native code paths); (2) a
			// getter+no-op-setter on registerPlugin makes core's `cap.registerPlugin = ...`
			// silently no-op so @capacitor/* plugins resolve through OUR registerPlugin.
			w.CapacitorCustomPlatform = { name: platform };
			w.Capacitor = {
				isNativePlatform: () => true,
				getPlatform: () => platform,
				isPluginAvailable: (name: string) => name in plugins,
				Plugins: plugins,
				convertFileSrc: (s: string) => s,
				DEBUG: false,
				platform
			};
			Object.defineProperty(w.Capacitor, 'registerPlugin', {
				configurable: true,
				get: () => ourRegisterPlugin,
				set: () => {
					// swallow @capacitor/core's overwrite so the mock stays authoritative
				}
			});
		},
		{ platform, appleAuthorization, healthKitDistance, barcodeResult, dialogConfirm }
	);
}
