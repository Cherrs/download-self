export type DownloadBase = {
	id: string;
	type: 'file' | 'link';
	name: string;
	description: string;
	badge: string;
	version: string;
	arch: string;
	createdAt: string;
};

export type FileItem = DownloadBase & {
	type: 'file';
	filename: string;
	originalName?: string;
	storage: 'r2';
	size?: number;
};

export type LinkItem = DownloadBase & {
	type: 'link';
	url: string;
};

export type DownloadItem = FileItem | LinkItem;

export type ApiResponse = {
	success: boolean;
	message?: string;
	items?: DownloadItem[];
	item?: DownloadItem;
	token?: string;
	requireCaptcha?: boolean;
};

export type DefaultDownload = Omit<FileItem, 'id' | 'type' | 'createdAt' | 'size'>;
