import type { Env } from './types/env';
import { handleApiRequest } from './handlers/api';
import { ensureSeeded } from './storage/downloads';
import { jsonResponse } from './utils/http';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const { pathname } = url;

		try {
			if (pathname.startsWith('/api/')) {
				await ensureSeeded(env);
				return handleApiRequest(request, env);
			}

			if (pathname === '/') {
				return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
			}

			if (pathname === '/admin') {
				return env.ASSETS.fetch(new Request(new URL('/admin.html', url), request));
			}

			return env.ASSETS.fetch(request);
		} catch (error) {
			console.error('Worker error:', error);
			return jsonResponse({ success: false, message: '服务器错误' }, 500);
		}
	}
} satisfies ExportedHandler<Env>;
