import type { Env } from '../types/env';
import { DOWNLOAD_TOKEN_TTL, MAX_FAILED_ATTEMPTS } from '../constants';
import { readJson, jsonResponse } from '../utils/http';
import { createToken } from '../utils/id';
import { getClientIp } from '../utils/ip';
import { encodeRFC5987Value } from '../utils/filename';
import { isTurnstileEnabled, verifyTurnstile } from '../utils/turnstile';
import { getFailedAttempts, resetFailedAttempts, setFailedAttempts } from '../storage/attempts';
import { getItemByFilename } from '../storage/downloads';

export async function handleVerifyPassword(request: Request, env: Env): Promise<Response> {
	const { password, turnstileToken } = await readJson<{ password?: string; turnstileToken?: string }>(request);
	const clientIp = getClientIp(request);
	const attempts = await getFailedAttempts(env, `download:${clientIp}`);
	const turnstileEnabled = isTurnstileEnabled(env);

	if (turnstileEnabled && attempts >= MAX_FAILED_ATTEMPTS) {
		if (!turnstileToken) {
			return jsonResponse({ success: false, message: '请完成验证码验证', requireCaptcha: true }, 400);
		}

		const valid = await verifyTurnstile(turnstileToken, clientIp, env);
		if (!valid) {
			return jsonResponse({ success: false, message: '验证码验证失败', requireCaptcha: true }, 400);
		}

		await resetFailedAttempts(env, `download:${clientIp}`);
	}

	if (password === env.DOWNLOAD_PASSWORD) {
		await resetFailedAttempts(env, `download:${clientIp}`);
		const token = createToken();
		await env.APP_KV.put(`download_token:${token}`, '1', { expirationTtl: DOWNLOAD_TOKEN_TTL });
		return jsonResponse({ success: true, token, message: '密码正确' });
	}

	const nextAttempts = attempts + 1;
	await setFailedAttempts(env, `download:${clientIp}`, nextAttempts);
	return jsonResponse({
		success: false,
		message: '密码错误',
		requireCaptcha: turnstileEnabled && nextAttempts >= MAX_FAILED_ATTEMPTS
	}, 401);
}

export async function handleDownload(request: Request, env: Env, filename: string): Promise<Response> {
	const url = new URL(request.url);
	const token = url.searchParams.get('token');
	if (!token) return jsonResponse({ success: false, message: '未授权访问' }, 401);

	const tokenValid = await env.APP_KV.get(`download_token:${token}`);
	if (!tokenValid) return jsonResponse({ success: false, message: 'Token无效或已过期' }, 401);

	const item = await getItemByFilename(env, filename);
	if (!item || item.type !== 'file' || item.storage !== 'r2') {
		return jsonResponse({ success: false, message: '文件不存在' }, 404);
	}

	const object = await env.UPLOADS_BUCKET.get(item.filename);
	if (!object) return jsonResponse({ success: false, message: '文件未找到' }, 404);

	const downloadName = item.originalName || item.filename;
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeRFC5987Value(downloadName)}`);
	headers.set('Cache-Control', 'no-store');
	return new Response(object.body, { headers });
}
