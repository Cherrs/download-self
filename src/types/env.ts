export interface Env {
	APP_KV: KVNamespace;
	UPLOADS_BUCKET: R2Bucket;
	ASSETS: Fetcher;
	ADMIN_PASSWORD?: string;
	DOWNLOAD_PASSWORD?: string;
	TURNSTILE_SECRET_KEY?: string;
	TURNSTILE_ENABLED?: string | boolean;
}
