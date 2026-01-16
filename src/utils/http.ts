import type { ApiResponse } from '../types/download';

export async function readJson<T>(request: Request): Promise<T> {
	try {
		return await request.json();
	} catch {
		return {} as T;
	}
}

export function jsonResponse(payload: ApiResponse, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8' }
	});
}
