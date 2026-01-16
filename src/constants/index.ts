import type { DefaultDownload } from '../types/download';

export const DOWNLOAD_TOKEN_TTL = 60 * 60;
export const ADMIN_TOKEN_TTL = 2 * 60 * 60;
export const FAILED_ATTEMPT_TTL = 60 * 60;
export const MAX_FAILED_ATTEMPTS = 3;
export const DOWNLOAD_INDEX_KEY = 'downloads:index';

export const DEFAULT_DOWNLOADS: DefaultDownload[] = [
	{
		name: 'RustDesk',
		filename: 'rustdesk-1.4.5-x86_64.exe',
		originalName: 'rustdesk-1.4.5-x86_64.exe',
		storage: 'r2',
		description: '开源远程桌面工具',
		badge: '远程桌面',
		version: '1.4.5',
		arch: 'x86_64'
	},
	{
		name: 'Mumble Client',
		filename: 'mumble_client-1.5.857.x64.exe',
		originalName: 'mumble_client-1.5.857.x64.exe',
		storage: 'r2',
		description: '低延迟语音通话',
		badge: '语音通讯',
		version: '1.5.857',
		arch: 'x64'
	}
];
