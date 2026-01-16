import type { Env } from '../types/env';

export function isTurnstileEnabled(env: Env): boolean {
	return env.TURNSTILE_ENABLED === true || env.TURNSTILE_ENABLED === 'true';
}

export async function verifyTurnstile(token: string, remoteip: string, env: Env): Promise<boolean> {
	if (!env.TURNSTILE_SECRET_KEY) return false;
	const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip });

	try {
		const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body
		});
		const data = await response.json<{ success?: boolean }>();
		return data.success === true;
	} catch (error) {
		console.error('Turnstile验证错误:', error);
		return false;
	}
}
