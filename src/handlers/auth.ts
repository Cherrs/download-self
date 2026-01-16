import type { Env } from '../types/env';
import { jsonResponse } from '../utils/http';

export async function requireAdminAuth(request: Request, env: Env): Promise<Response | null> {
	const authHeader = request.headers.get('authorization') || '';
	const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
	if (!token) return jsonResponse({ success: false, message: '未授权访问' }, 401);

	const valid = await env.APP_KV.get(`admin_token:${token}`);
	if (!valid) return jsonResponse({ success: false, message: '登录已过期，请重新登录' }, 401);
	return null;
}
