import type { Env } from '../types/env';
import type { FileItem, LinkItem } from '../types/download';
import { ADMIN_TOKEN_TTL, MAX_FAILED_ATTEMPTS } from '../constants';
import { readJson, jsonResponse } from '../utils/http';
import { createId, createToken } from '../utils/id';
import { getClientIp } from '../utils/ip';
import { sanitizeFilename, stripExtension } from '../utils/filename';
import { isTurnstileEnabled, verifyTurnstile } from '../utils/turnstile';
import { getFailedAttempts, resetFailedAttempts, setFailedAttempts } from '../storage/attempts';
import { deleteItem, getItemById, insertItem } from '../storage/downloads';

export async function handleAdminLogin(request: Request, env: Env): Promise<Response> {
	const { password, turnstileToken } = await readJson<{ password?: string; turnstileToken?: string }>(request);
	const clientIp = getClientIp(request);

	if (!env.ADMIN_PASSWORD) {
		return jsonResponse({ success: false, message: '未配置管理员密码' }, 500);
	}

	const attempts = await getFailedAttempts(env, `admin:${clientIp}`);
	const turnstileEnabled = isTurnstileEnabled(env);

	if (turnstileEnabled && attempts >= MAX_FAILED_ATTEMPTS) {
		if (!turnstileToken) {
			return jsonResponse({ success: false, message: '请完成验证码验证', requireCaptcha: true }, 400);
		}

		const valid = await verifyTurnstile(turnstileToken, clientIp, env);
		if (!valid) {
			return jsonResponse({ success: false, message: '验证码验证失败', requireCaptcha: true }, 400);
		}

		await resetFailedAttempts(env, `admin:${clientIp}`);
	}

	if (!password || password !== env.ADMIN_PASSWORD) {
		const nextAttempts = attempts + 1;
		await setFailedAttempts(env, `admin:${clientIp}`, nextAttempts);
		return jsonResponse({
			success: false,
			message: '管理员密码错误',
			requireCaptcha: turnstileEnabled && nextAttempts >= MAX_FAILED_ATTEMPTS
		}, 401);
	}

	await resetFailedAttempts(env, `admin:${clientIp}`);
	const token = createToken();
	await env.APP_KV.put(`admin_token:${token}`, '1', { expirationTtl: ADMIN_TOKEN_TTL });
	return jsonResponse({ success: true, token, message: '登录成功' });
}

export async function handleAdminLink(request: Request, env: Env): Promise<Response> {
	const { name, url, description, badge, version, arch } = await readJson<{
		name?: string;
		url?: string;
		description?: string;
		badge?: string;
		version?: string;
		arch?: string;
	}>(request);

	if (!name || !url) {
		return jsonResponse({ success: false, message: '名称和链接不能为空' }, 400);
	}

	try {
		new URL(url);
	} catch {
		return jsonResponse({ success: false, message: '链接格式不正确' }, 400);
	}

	const item: LinkItem = {
		id: createId(),
		type: 'link',
		name: name.trim(),
		url: url.trim(),
		description: (description || '').trim(),
		badge: (badge || '').trim(),
		version: (version || '').trim(),
		arch: (arch || '').trim(),
		createdAt: new Date().toISOString()
	};

	await insertItem(env, item);
	return jsonResponse({ success: true, item });
}

export async function handleAdminUpload(request: Request, env: Env): Promise<Response> {
	const contentType = request.headers.get('content-type') || '';
	if (!contentType.includes('multipart/form-data')) {
		return jsonResponse({ success: false, message: '上传格式不正确' }, 400);
	}

	const form = await request.formData();
	const file = form.get('file');
	if (!file || typeof file === 'string') {
		return jsonResponse({ success: false, message: '未选择文件' }, 400);
	}

	const name = (form.get('name') || '').toString().trim();
	const description = (form.get('description') || '').toString().trim();
	const badge = (form.get('badge') || '').toString().trim();
	const version = (form.get('version') || '').toString().trim();
	const arch = (form.get('arch') || '').toString().trim();

	const safeOriginalName = file.name || 'upload.bin';
	const safeName = sanitizeFilename(safeOriginalName);
	const key = `${Date.now()}-${safeName}`;

	await env.UPLOADS_BUCKET.put(key, await file.arrayBuffer(), {
		httpMetadata: { contentType: file.type || 'application/octet-stream' }
	});

	const item: FileItem = {
		id: createId(),
		type: 'file',
		name: name || stripExtension(safeOriginalName),
		filename: key,
		originalName: safeOriginalName,
		storage: 'r2',
		size: file.size,
		description,
		badge,
		version,
		arch,
		createdAt: new Date().toISOString()
	};

	await insertItem(env, item);
	return jsonResponse({ success: true, item });
}

export async function handleAdminDelete(id: string, env: Env): Promise<Response> {
	const removed = await getItemById(env, id);
	if (!removed) {
		return jsonResponse({ success: false, message: '未找到该资源' }, 404);
	}

	if (removed.type === 'file' && removed.storage === 'r2') {
		await env.UPLOADS_BUCKET.delete(removed.filename);
	}

	await deleteItem(env, id, removed);
	return jsonResponse({ success: true });
}
