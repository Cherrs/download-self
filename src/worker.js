const DOWNLOAD_TOKEN_TTL = 60 * 60;
const ADMIN_TOKEN_TTL = 2 * 60 * 60;
const FAILED_ATTEMPT_TTL = 60 * 60;
const MAX_FAILED_ATTEMPTS = 3;
const DOWNLOAD_INDEX_KEY = 'downloads:index';

const DEFAULT_DOWNLOADS = [
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

export default {
    async fetch(request, env, ctx) {
        try {
            const url = new URL(request.url);
            const { pathname } = url;

            if (pathname.startsWith('/api/')) {
                await ensureSeeded(env);
                return handleApiRequest(request, env);
            }

            // 处理首页路由
            if (pathname === '/') {
                url.pathname = '/index.html';
                return env.ASSETS.fetch(new Request(url.toString(), request));
            }

            if (pathname === '/admin') {
                url.pathname = '/admin.html';
                return env.ASSETS.fetch(new Request(url.toString(), request));
            }

            return env.ASSETS.fetch(request);
        } catch (error) {
            console.error('Worker error:', error);
            return jsonResponse({ success: false, message: '服务器错误' }, 500);
        }
    }
};

async function handleApiRequest(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === 'GET' && pathname === '/api/files') {
        const items = await getAllItems(env);
        return jsonResponse({ success: true, items });
    }

    if (request.method === 'GET' && pathname === '/api/admin/files') {
        const authError = await requireAdminAuth(request, env);
        if (authError) return authError;

        const items = await getAllItems(env);
        return jsonResponse({ success: true, items });
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

async function handleAdminLogin(request, env) {
    const { password, turnstileToken } = await readJson(request);
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

async function handleAdminLink(request, env) {
    const { name, url, description, badge, version, arch } = await readJson(request);

    if (!name || !url) {
        return jsonResponse({ success: false, message: '名称和链接不能为空' }, 400);
    }

    try {
        new URL(url);
    } catch (error) {
        return jsonResponse({ success: false, message: '链接格式不正确' }, 400);
    }

    const item = {
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

async function handleAdminUpload(request, env) {
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
        httpMetadata: {
            contentType: file.type || 'application/octet-stream'
        }
    });

    const item = {
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

async function handleAdminDelete(id, env) {
    const removed = await getItemById(env, id);
    if (!removed) {
        return jsonResponse({ success: false, message: '未找到该资源' }, 404);
    }

    if (removed.type === 'file' && removed.storage === 'r2' && removed.filename) {
        await env.UPLOADS_BUCKET.delete(removed.filename);
    }

    await deleteItem(env, id, removed);
    return jsonResponse({ success: true });
}

async function handleVerifyPassword(request, env) {
    const { password, turnstileToken } = await readJson(request);
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

async function handleDownload(request, env, filename) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
        return jsonResponse({ success: false, message: '未授权访问' }, 401);
    }

    const tokenValid = await env.APP_KV.get(`download_token:${token}`);
    if (!tokenValid) {
        return jsonResponse({ success: false, message: 'Token无效或已过期' }, 401);
    }

    const item = await getItemByFilename(env, filename);
    if (!item) {
        return jsonResponse({ success: false, message: '文件不存在' }, 404);
    }

    if (item.storage !== 'r2') {
        return jsonResponse({ success: false, message: '文件存储不可用' }, 404);
    }

    const object = await env.UPLOADS_BUCKET.get(item.filename);
    if (!object) {
        return jsonResponse({ success: false, message: '文件未找到' }, 404);
    }

    const downloadName = item.originalName || item.filename;
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeRFC5987Value(downloadName)}`);
    headers.set('Cache-Control', 'no-store');

    return new Response(object.body, { headers });
}

async function requireAdminAuth(request, env) {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return jsonResponse({ success: false, message: '未授权访问' }, 401);
    }

    const valid = await env.APP_KV.get(`admin_token:${token}`);
    if (!valid) {
        return jsonResponse({ success: false, message: '登录已过期，请重新登录' }, 401);
    }

    return null;
}

async function getAllItems(env) {
    const index = await getDownloadIndex(env);
    if (!index.length) return [];

    const items = [];
    for (let i = 0; i < index.length; i += 100) {
        const batch = index.slice(i, i + 100);
        const keys = batch.map((id) => getItemKey(id));
        const results = await env.APP_KV.get(keys, 'json');

        for (const id of batch) {
            const item = results.get(getItemKey(id));
            if (item) items.push(item);
        }
    }

    return items;
}

async function getItemById(env, id) {
    return await env.APP_KV.get(getItemKey(id), 'json');
}

async function getItemByFilename(env, filename) {
    const id = await env.APP_KV.get(getFilenameKey(filename));
    if (!id) return null;
    return await getItemById(env, id);
}

async function insertItem(env, item) {
    await env.APP_KV.put(getItemKey(item.id), JSON.stringify(item));

    if (item.type === 'file' && item.filename) {
        await env.APP_KV.put(getFilenameKey(item.filename), item.id);
    }

    const index = await getDownloadIndex(env);
    const nextIndex = [item.id, ...index.filter((id) => id !== item.id)];
    await env.APP_KV.put(DOWNLOAD_INDEX_KEY, JSON.stringify(nextIndex));
}

async function deleteItem(env, id, item) {
    const existing = item || await getItemById(env, id);
    if (existing?.type === 'file' && existing.filename) {
        await env.APP_KV.delete(getFilenameKey(existing.filename));
    }

    await env.APP_KV.delete(getItemKey(id));

    const index = await getDownloadIndex(env);
    const nextIndex = index.filter((entryId) => entryId !== id);
    await env.APP_KV.put(DOWNLOAD_INDEX_KEY, JSON.stringify(nextIndex));
}

async function ensureSeeded(env) {
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

function getItemKey(id) {
    return `downloads:item:${id}`;
}

function getFilenameKey(filename) {
    return `downloads:filename:${filename}`;
}

async function getDownloadIndex(env) {
    const index = await env.APP_KV.get(DOWNLOAD_INDEX_KEY, 'json');
    return Array.isArray(index) ? index : [];
}

async function readJson(request) {
    try {
        return await request.json();
    } catch (error) {
        return {};
    }
}

function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    });
}

function createId() {
    return crypto.randomUUID();
}

function createToken() {
    return crypto.randomUUID();
}

function getClientIp(request) {
    const cfIp = request.headers.get('cf-connecting-ip');
    if (cfIp) return cfIp;
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return 'unknown';
}

function isTurnstileEnabled(env) {
    return env.TURNSTILE_ENABLED === true || env.TURNSTILE_ENABLED === 'true';
}

async function verifyTurnstile(token, remoteip, env) {
    if (!env.TURNSTILE_SECRET_KEY) {
        return false;
    }

    const body = new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip
    });

    try {
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body
        });

        const data = await response.json();
        return data.success === true;
    } catch (error) {
        console.error('Turnstile验证错误:', error);
        return false;
    }
}

function sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function stripExtension(name) {
    const index = name.lastIndexOf('.');
    if (index <= 0) return name;
    return name.slice(0, index);
}

function encodeRFC5987Value(value) {
    return encodeURIComponent(value)
        .replace(/['()]/g, escape)
        .replace(/\*/g, '%2A')
        .replace(/%(7C|60|5E)/g, (match) => match.toLowerCase());
}

async function getFailedAttempts(env, keySuffix) {
    const value = await env.APP_KV.get(`failed:${keySuffix}`);
    return value ? Number.parseInt(value, 10) || 0 : 0;
}

async function setFailedAttempts(env, keySuffix, count) {
    await env.APP_KV.put(`failed:${keySuffix}`, String(count), { expirationTtl: FAILED_ATTEMPT_TTL });
}

async function resetFailedAttempts(env, keySuffix) {
    await env.APP_KV.delete(`failed:${keySuffix}`);
}
