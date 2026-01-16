import type { Env } from '../types/env';
import type { DownloadItem } from '../types/download';
import { DEFAULT_DOWNLOADS, DOWNLOAD_INDEX_KEY } from '../constants';
import { createId } from '../utils/id';

export async function getAllItems(env: Env): Promise<DownloadItem[]> {
	const index = await getDownloadIndex(env);
	if (!index.length) return [];

	const items: DownloadItem[] = [];
	for (let i = 0; i < index.length; i += 100) {
		const batch = index.slice(i, i + 100);
		const keys = batch.map((id) => getItemKey(id));
		const results = await env.APP_KV.get<DownloadItem>(keys, 'json');
		for (const id of batch) {
			const item = results.get(getItemKey(id));
			if (item) items.push(item);
		}
	}

	return items;
}

export async function getItemById(env: Env, id: string): Promise<DownloadItem | null> {
	return await env.APP_KV.get<DownloadItem>(getItemKey(id), 'json');
}

export async function getItemByFilename(env: Env, filename: string): Promise<DownloadItem | null> {
	const id = await env.APP_KV.get(getFilenameKey(filename));
	return id ? await getItemById(env, id) : null;
}

export async function insertItem(env: Env, item: DownloadItem): Promise<void> {
	await env.APP_KV.put(getItemKey(item.id), JSON.stringify(item));
	if (item.type === 'file' && item.filename) {
		await env.APP_KV.put(getFilenameKey(item.filename), item.id);
	}
	const index = await getDownloadIndex(env);
	const nextIndex = [item.id, ...index.filter((id) => id !== item.id)];
	await env.APP_KV.put(DOWNLOAD_INDEX_KEY, JSON.stringify(nextIndex));
}

export async function deleteItem(env: Env, id: string, item?: DownloadItem): Promise<void> {
	const existing = item || await getItemById(env, id);
	if (existing?.type === 'file' && existing.filename) {
		await env.APP_KV.delete(getFilenameKey(existing.filename));
	}
	await env.APP_KV.delete(getItemKey(id));
	const index = await getDownloadIndex(env);
	const nextIndex = index.filter((entryId) => entryId !== id);
	await env.APP_KV.put(DOWNLOAD_INDEX_KEY, JSON.stringify(nextIndex));
}

export async function ensureSeeded(env: Env): Promise<void> {
	const seeded = await env.APP_KV.get('seeded');
	if (seeded) return;

	const index = await getDownloadIndex(env);
	if (index.length === 0) {
		for (const item of DEFAULT_DOWNLOADS) {
			await insertItem(env, {
				id: createId(),
				type: 'file',
				name: item.name,
				filename: item.filename,
				originalName: item.originalName,
				storage: item.storage,
				description: item.description,
				badge: item.badge,
				version: item.version,
				arch: item.arch,
				createdAt: new Date().toISOString()
			});
		}
	}

	await env.APP_KV.put('seeded', '1');
}

export function getItemKey(id: string): string {
	return `downloads:item:${id}`;
}

export function getFilenameKey(filename: string): string {
	return `downloads:filename:${filename}`;
}

export async function getDownloadIndex(env: Env): Promise<string[]> {
	const index = await env.APP_KV.get<string[]>(DOWNLOAD_INDEX_KEY, 'json');
	return Array.isArray(index) ? index : [];
}
