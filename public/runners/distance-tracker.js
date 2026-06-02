const SESSION_KEY = 'distance_tracker_session';
const MAX_SPEED_MPS = 8.9408;
const MIN_DELTA_METERS = 5;
const NOTIFICATION_ID = 9007199; // arbitrary stable id for the goal-reached toast

function readSession() {
	try {
		const entry = CapacitorKV.get(SESSION_KEY);
		const value = entry && entry.value;
		if (!value) return null;
		return JSON.parse(value);
	} catch (e) {
		console.error('[distance-runner] failed to read session', e);
		return null;
	}
}

function writeSession(s) {
	CapacitorKV.set(SESSION_KEY, JSON.stringify(s));
}

function clearSession() {
	CapacitorKV.remove(SESSION_KEY);
}

function haversineMeters(a, b) {
	const R = 6371000;
	const toRad = (d) => (d * Math.PI) / 180;
	const dLat = toRad(b.latitude - a.latitude);
	const dLon = toRad(b.longitude - a.longitude);
	const lat1 = toRad(a.latitude);
	const lat2 = toRad(b.latitude);
	const x =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function notifyGoalReached() {
	try {
		CapacitorNotifications.schedule([
			{
				id: NOTIFICATION_ID,
				title: 'Distance goal reached',
				body: 'Open the app to submit your quest step.',
				scheduleAt: new Date(Date.now() + 1000)
			}
		]);
	} catch (e) {
		console.error('[distance-runner] failed to schedule notification', e);
	}
}

// Start a tracking session. Called from the main app via dispatchEvent right
// after the user taps "Start Tracking" in MDistance.vue. The main app also
// passes its current foreground progress so we don't overwrite it with 0 on
// the first scheduled tick.
addEventListener('start', (resolve, reject, args) => {
	try {
		const next = {
			tracking: true,
			questId: args.questId,
			stepIndex: args.stepIndex,
			altIndex: args.altIndex || 0,
			targetMeters: args.targetMeters,
			startedAt: args.startedAt || Date.now(),
			progress: typeof args.progress === 'number' ? args.progress : 0,
			lastLocation: null,
			lastUpdate: Date.now()
		};
		writeSession(next);
		resolve({ progress: next.progress });
	} catch (e) {
		reject(e);
	}
});

// Stop the session entirely (user paused / submitted / reset). Future ticks
// will see no session and no-op until the user starts again.
addEventListener('stop', (resolve, reject) => {
	try {
		clearSession();
		resolve({ ok: true });
	} catch (e) {
		reject(e);
	}
});

// Read-only snapshot for the foreground component to pull on mount/resume.
addEventListener('getProgress', (resolve) => {
	const s = readSession();
	if (!s) {
		resolve({ tracking: false, progress: 0 });
		return;
	}
	resolve({
		tracking: !!s.tracking,
		progress: s.progress,
		questId: s.questId,
		stepIndex: s.stepIndex,
		altIndex: s.altIndex,
		targetMeters: s.targetMeters,
		startedAt: s.startedAt,
		lastUpdate: s.lastUpdate
	});
});

// Mainline-to-runner sync: the foreground pedometer accumulates distance fast,
// and we mirror it here periodically so the next scheduled GPS tick anchors
// from the correct progress value. Take the max so we never regress.
addEventListener('syncForeground', (resolve, reject, args) => {
	try {
		const s = readSession();
		if (!s || !s.tracking) {
			resolve({ progress: 0, tracking: false });
			return;
		}
		if (typeof args.progress === 'number' && args.progress > s.progress) {
			s.progress = Math.min(s.targetMeters, args.progress);
		}
		s.lastUpdate = Date.now();
		writeSession(s);
		resolve({ progress: s.progress, tracking: s.tracking });
	} catch (e) {
		reject(e);
	}
});

// The configured scheduled event — fires when the OS decides (≥15 min on
// Android, OS-determined on iOS). Sample location, fold it in, persist.
addEventListener('distanceTick', async (resolve, reject) => {
	try {
		const s = readSession();
		if (!s || !s.tracking) {
			resolve();
			return;
		}

		let location;
		try {
			location = await CapacitorGeolocation.getCurrentPosition();
		} catch (e) {
			console.error('[distance-runner] geolocation failed', e);
			resolve();
			return;
		}

		const nowMs = Date.now();
		if (s.lastLocation) {
			const dist = haversineMeters(s.lastLocation, location);
			const elapsedMs = Math.max(1, nowMs - s.lastUpdate);
			const maxAllowed = MAX_SPEED_MPS * (elapsedMs / 1000);
			// 20 mph cap shared with the foreground tracker — anything faster is
			// vehicular and gets clamped rather than rejected outright, since GPS
			// noise can produce single jumpy samples even at walking speed.
			const accepted = Math.min(dist, maxAllowed);
			if (accepted >= MIN_DELTA_METERS) {
				s.progress = Math.min(s.targetMeters, s.progress + accepted);
				if (s.progress >= s.targetMeters) {
					notifyGoalReached();
					s.tracking = false;
				}
			}
		}

		s.lastLocation = { latitude: location.latitude, longitude: location.longitude };
		s.lastUpdate = nowMs;
		writeSession(s);
		resolve();
	} catch (e) {
		reject(e);
	}
});
