import { existsSync, readFileSync, statSync } from 'node:fs';
import http, { type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// repo root is three up from tests/e2e/utils
const PROJECT_ROOT = resolve(__dirname, '../../..');
const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '127.0.0.1';
const DIST_DIR = resolve(PROJECT_ROOT, process.env.DIST_DIR ?? 'dist');

const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.ico': 'image/x-icon',
	'.webmanifest': 'application/manifest+json',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.txt': 'text/plain; charset=utf-8',
	'.map': 'application/json; charset=utf-8'
};

function send(res: ServerResponse, status: number, body: Buffer | string, type: string) {
	res.writeHead(status, {
		'content-type': type,
		// permissive CORS mirrors sky's nitro routeRules
		'access-control-allow-origin': '*',
		'referrer-policy': 'no-referrer'
	});
	res.end(body);
}

function tryFile(absPath: string): { body: Buffer; type: string } | null {
	if (!existsSync(absPath)) return null;
	let stat;
	try {
		stat = statSync(absPath);
	} catch {
		return null;
	}
	if (stat.isDirectory()) {
		const indexPath = join(absPath, 'index.html');
		if (existsSync(indexPath)) {
			return { body: readFileSync(indexPath), type: MIME['.html']! };
		}
		return null;
	}
	const type = MIME[extname(absPath).toLowerCase()] ?? 'application/octet-stream';
	return { body: readFileSync(absPath), type };
}

const server = http.createServer((req, res) => {
	const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
	// strip leading slash, normalize away any path traversal
	const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
	const absPath = resolve(DIST_DIR, '.' + (rel.startsWith('/') ? rel : '/' + rel));

	// guard: never serve outside DIST_DIR
	if (!absPath.startsWith(DIST_DIR)) {
		return send(res, 403, 'Forbidden', MIME['.txt']!);
	}

	const direct = tryFile(absPath);
	if (direct) return send(res, 200, direct.body, direct.type);

	// SPA fallback - 200.html is Nuxt's static client fallback, index.html otherwise
	for (const fallback of ['200.html', 'index.html']) {
		const fb = tryFile(resolve(DIST_DIR, fallback));
		if (fb) return send(res, 200, fb.body, fb.type);
	}

	send(res, 404, 'Not Found', MIME['.txt']!);
});

server.listen(PORT, HOST, () => {
	console.log(`[static-server] serving ${DIST_DIR} → http://${HOST}:${PORT}`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
