import type { Env } from '../types/env';
import { jsonResponse } from '../utils/http';
import { getAllItems } from '../storage/downloads';
import { handleAdminDelete, handleAdminLink, handleAdminLogin, handleAdminUpload } from './admin';
import { handleDownload, handleVerifyPassword } from './download';
import { requireAdminAuth } from './auth.js';

export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const { pathname } = url;

	if (request.method === 'GET' && pathname === '/api/files') {
		return jsonResponse({ success: true, items: await getAllItems(env) });
	}

	if (request.method === 'GET' && pathname === '/api/admin/files') {
		const authError = await requireAdminAuth(request, env);
		if (authError) return authError;
		return jsonResponse({ success: true, items: await getAllItems(env) });
	}

	if (request.method === 'POST' && pathname === '/api/admin/login') {
		return handleAdminLogin(request, env);
	}

	if (request.method === 'POST' && pathname === '/api/admin/link') {
		const authError = await requireAdminAuth(request, env);
		if (authError) return authError;
		return handleAdminLink(request, env);
	}

	if (request.method === 'POST' && pathname === '/api/admin/upload') {
		const authError = await requireAdminAuth(request, env);
		if (authError) return authError;
		return handleAdminUpload(request, env);
	}

	const deleteMatch = pathname.match(/^\/api\/admin\/files\/(.+)$/);
	if (request.method === 'DELETE' && deleteMatch) {
		const authError = await requireAdminAuth(request, env);
		if (authError) return authError;
		return handleAdminDelete(deleteMatch[1], env);
	}

	if (request.method === 'POST' && pathname === '/api/verify-password') {
		return handleVerifyPassword(request, env);
	}

	const downloadMatch = pathname.match(/^\/api\/download\/(.+)$/);
	if (request.method === 'GET' && downloadMatch) {
		return handleDownload(request, env, decodeURIComponent(downloadMatch[1]));
	}

	return jsonResponse({ success: false, message: '未找到接口' }, 404);
}
