function isUnheadCircularJson(reason: unknown): boolean {
	const msg =
		reason instanceof Error
			? `${reason.message}\n${reason.stack ?? ''}`
			: typeof reason === 'string'
				? reason
				: '';
	return msg.includes('Converting circular structure to JSON') && msg.includes('unhead');
}

if (typeof process !== 'undefined' && typeof process.on === 'function') {
	process.on('unhandledRejection', (reason) => {
		if (isUnheadCircularJson(reason)) return; // benign head-render noise; swallow

		// not ours - re-raise on the next tick so vitest's own handler reports it
		setImmediate(() => {
			throw reason;
		});
	});
}
