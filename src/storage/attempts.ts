import type { Env } from '../types/env';
import { FAILED_ATTEMPT_TTL } from '../constants';

export async function getFailedAttempts(env: Env, keySuffix: string): Promise<number> {
	const value = await env.APP_KV.get(`failed:${keySuffix}`);
	return value ? Number.parseInt(value, 10) || 0 : 0;
}

export async function setFailedAttempts(env: Env, keySuffix: string, count: number): Promise<void> {
	await env.APP_KV.put(`failed:${keySuffix}`, String(count), { expirationTtl: FAILED_ATTEMPT_TTL });
}

export async function resetFailedAttempts(env: Env, keySuffix: string): Promise<void> {
	await env.APP_KV.delete(`failed:${keySuffix}`);
}
