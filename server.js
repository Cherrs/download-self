const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const initSqlJs = require('sql.js');
require('dotenv').config();

const app = express();

// 从环境变量读取配置，提供默认值
const PORT = process.env.PORT || 3000;
const DOWNLOAD_PASSWORD = process.env.DOWNLOAD_PASSWORD;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const TURNSTILE_ENABLED = process.env.TURNSTILE_ENABLED === 'true' || false;

// 失败次数记录
const failedAttempts = new Map();
const adminFailedAttempts = new Map();

// 有效的token集合（token -> 过期时间）
const validTokens = new Map();

// 管理员token集合（token -> 过期时间）
const adminTokens = new Map();

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'downloads.db');

ensureDirectories();
let db;
const dbReady = initializeDatabase();

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOADS_DIR),
        filename: (req, file, cb) => {
            const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            cb(null, `${Date.now()}-${safeName}`);
        }
    }),
    limits: {
        fileSize: 2 * 1024 * 1024 * 1024
    }
});

// 定期清理过期token（每10分钟执行一次）
setInterval(() => {
    const now = Date.now();
    for (const [token, expiresAt] of validTokens.entries()) {
        if (now > expiresAt) {
            validTokens.delete(token);
        }
    }
    for (const [token, expiresAt] of adminTokens.entries()) {
        if (now > expiresAt) {
            adminTokens.delete(token);
        }
    }
}, 10 * 60 * 1000);

// 启动时打印配置（密码部分隐藏）
console.log('服务器配置:');
console.log(`  端口: ${PORT}`);
console.log(`  密码: ${DOWNLOAD_PASSWORD.substring(0, 2)}***`);
console.log(`  Turnstile: ${TURNSTILE_ENABLED ? '启用' : '禁用'}`);
if (TURNSTILE_ENABLED && !TURNSTILE_SECRET_KEY) {
    console.warn('  ⚠️  警告: Turnstile已启用但未配置Secret Key');
}
if (!ADMIN_PASSWORD) {
    console.warn('  ⚠️  警告: 未配置 ADMIN_PASSWORD，管理页面将无法登录');
}

// 中间件
app.use(express.json());
app.use(express.static(__dirname, {
    index: 'index.html',
    // 排除exe文件，不允许直接访问
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.exe')) {
            res.status(403).send('Forbidden');
        }
    }
}));

// 管理员登录
app.post('/api/admin/login', async (req, res) => {
    const { password, turnstileToken } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;
    const attempts = adminFailedAttempts.get(clientIp) || 0;

    if (!ADMIN_PASSWORD) {
        return res.status(500).json({
            success: false,
            message: '未配置管理员密码'
        });
    }

    if (TURNSTILE_ENABLED && attempts >= 3) {
        if (!turnstileToken) {
            return res.status(400).json({
                success: false,
                message: '请完成验证码验证',
                requireCaptcha: true
            });
        }

        const isValid = await verifyTurnstile(turnstileToken, clientIp);
        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: '验证码验证失败',
                requireCaptcha: true
            });
        }

        // Turnstile验证通过，重置失败次数
        adminFailedAttempts.delete(clientIp);
    }

    if (!password || password !== ADMIN_PASSWORD) {
        const currentAttempts = adminFailedAttempts.get(clientIp) || 0;
        adminFailedAttempts.set(clientIp, currentAttempts + 1);
        return res.status(401).json({
            success: false,
            message: '管理员密码错误',
            requireCaptcha: TURNSTILE_ENABLED && (currentAttempts + 1) >= 3
        });
    }

    adminFailedAttempts.delete(clientIp);

    const token = createToken();
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
    adminTokens.set(token, expiresAt);

    return res.json({
        success: true,
        token,
        message: '登录成功'
    });
});

// 公共文件列表
app.get('/api/files', async (req, res) => {
    await dbReady;
    const items = getAllItems();
    res.json({
        success: true,
        items
    });
});

// 管理员文件列表
app.get('/api/admin/files', requireAdminAuth, async (req, res) => {
    await dbReady;
    const items = getAllItems();
    res.json({
        success: true,
        items
    });
});

// 管理员新增链接
app.post('/api/admin/link', requireAdminAuth, async (req, res) => {
    const { name, url, description, badge, version, arch } = req.body;

    if (!name || !url) {
        return res.status(400).json({
            success: false,
            message: '名称和链接不能为空'
        });
    }

    try {
        new URL(url);
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: '链接格式不正确'
        });
    }

    await dbReady;

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

    insertItem(item);

    res.json({
        success: true,
        item
    });
});

// 管理员上传文件
app.post('/api/admin/upload', requireAdminAuth, upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: '未选择文件'
        });
    }

    const { name, description, badge, version, arch } = req.body;
    const displayName = (name || '').trim() || path.parse(req.file.originalname).name;

    await dbReady;

    const item = {
        id: createId(),
        type: 'file',
        name: displayName,
        filename: req.file.filename,
        originalName: req.file.originalname,
        storage: 'uploads',
        size: req.file.size,
        description: (description || '').trim(),
        badge: (badge || '').trim(),
        version: (version || '').trim(),
        arch: (arch || '').trim(),
        createdAt: new Date().toISOString()
    };

    insertItem(item);

    res.json({
        success: true,
        item
    });
});

// 管理员删除文件/链接
app.delete('/api/admin/files/:id', requireAdminAuth, async (req, res) => {
    const { id } = req.params;
    await dbReady;

    const removed = getItemById(id);
    if (!removed) {
        return res.status(404).json({
            success: false,
            message: '未找到该资源'
        });
    }

    if (removed.type === 'file' && removed.storage === 'uploads') {
        const filePath = path.join(UPLOADS_DIR, removed.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    deleteItem(id);

    res.json({
        success: true
    });
});

// 验证密码的API
app.post('/api/verify-password', async (req, res) => {
    const { password, turnstileToken } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    // 获取该IP的失败次数
    const attempts = failedAttempts.get(clientIp) || 0;

    // 如果失败3次或以上且启用了Turnstile，需要验证
    if (TURNSTILE_ENABLED && attempts >= 3) {
        if (!turnstileToken) {
            return res.status(400).json({
                success: false,
                message: '请完成验证码验证',
                requireCaptcha: true
            });
        }

        // 验证Turnstile token
        const isValid = await verifyTurnstile(turnstileToken, clientIp);
        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: '验证码验证失败',
                requireCaptcha: true
            });
        }

        // Turnstile验证通过，重置失败次数
        failedAttempts.delete(clientIp);
    }

    if (password === DOWNLOAD_PASSWORD) {
        // 密码正确，清除失败记录
        failedAttempts.delete(clientIp);

        // 生成一个token并设置过期时间（1小时）
        const token = createToken();
        const expiresAt = Date.now() + 60 * 60 * 1000; // 1小时后过期
        validTokens.set(token, expiresAt);

        res.json({
            success: true,
            token: token,
            message: '密码正确'
        });
    } else {
        // 密码错误，增加失败次数
        const currentAttempts = failedAttempts.get(clientIp) || 0;
        failedAttempts.set(clientIp, currentAttempts + 1);

        res.status(401).json({
            success: false,
            message: '密码错误',
            requireCaptcha: TURNSTILE_ENABLED && (currentAttempts + 1) >= 3
        });
    }
});

// 验证Cloudflare Turnstile
async function verifyTurnstile(token, remoteip) {
    try {
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                secret: TURNSTILE_SECRET_KEY,
                response: token,
                remoteip: remoteip
            })
        });

        const data = await response.json();
        return data.success === true;
    } catch (error) {
        console.error('Turnstile验证错误:', error);
        return false;
    }
}

// 下载文件的API
app.get('/api/download/:filename', async (req, res) => {
    const { filename } = req.params;
    const { token } = req.query;

    // 验证token是否存在
    if (!token) {
        return res.status(401).json({
            success: false,
            message: '未授权访问'
        });
    }

    // 验证token是否有效
    const expiresAt = validTokens.get(token);
    if (!expiresAt) {
        return res.status(401).json({
            success: false,
            message: 'Token无效或已过期'
        });
    }

    // 检查token是否过期
    if (Date.now() > expiresAt) {
        validTokens.delete(token);
        return res.status(401).json({
            success: false,
            message: 'Token已过期，请重新验证'
        });
    }

    await dbReady;

    const targetItem = getItemByFilename(filename);
    if (!targetItem) {
        return res.status(404).json({
            success: false,
            message: '文件不存在'
        });
    }

    const baseDir = targetItem.storage === 'uploads' ? UPLOADS_DIR : __dirname;
    const filePath = path.join(baseDir, filename);

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: '文件未找到'
        });
    }

    // 设置响应头，触发下载
    res.download(filePath, filename, (err) => {
        if (err) {
            console.error('下载错误:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: '下载失败'
                });
            }
        }
    });
});

dbReady.catch((error) => {
    console.error('数据库初始化失败:', error);
    process.exit(1);
});

app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});

function ensureDirectories() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function createId() {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return crypto.randomBytes(16).toString('hex');
}

function createToken() {
    return Buffer.from(`${Date.now()}-${Math.random()}`).toString('base64');
}

async function initializeDatabase() {
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    db.run(`
        CREATE TABLE IF NOT EXISTS downloads (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            url TEXT,
            description TEXT,
            badge TEXT,
            version TEXT,
            arch TEXT,
            filename TEXT,
            originalName TEXT,
            storage TEXT,
            size INTEGER,
            createdAt TEXT
        )
    `);

    const count = getCount();
    if (count === 0) {
        seedDefaults();
    }

    persistDb();
}

function getCount() {
    const rows = queryAll('SELECT COUNT(1) as total FROM downloads');
    return rows[0]?.total || 0;
}

function seedDefaults() {
    const defaults = [
        {
            id: createId(),
            type: 'file',
            name: 'RustDesk',
            filename: 'rustdesk-1.4.5-x86_64.exe',
            originalName: 'rustdesk-1.4.5-x86_64.exe',
            storage: 'root',
            description: '开源远程桌面工具',
            badge: '远程桌面',
            version: '1.4.5',
            arch: 'x86_64',
            createdAt: new Date().toISOString()
        },
        {
            id: createId(),
            type: 'file',
            name: 'Mumble Client',
            filename: 'mumble_client-1.5.857.x64.exe',
            originalName: 'mumble_client-1.5.857.x64.exe',
            storage: 'root',
            description: '低延迟语音通话',
            badge: '语音通讯',
            version: '1.5.857',
            arch: 'x64',
            createdAt: new Date().toISOString()
        }
    ];

    defaults.forEach(insertItem);
}

function insertItem(item) {
    db.run(
        `INSERT INTO downloads (
            id, type, name, url, description, badge, version, arch,
            filename, originalName, storage, size, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        [
            item.id,
            item.type,
            item.name,
            item.url || null,
            item.description || null,
            item.badge || null,
            item.version || null,
            item.arch || null,
            item.filename || null,
            item.originalName || null,
            item.storage || null,
            item.size || null,
            item.createdAt || new Date().toISOString()
        ]
    );

    persistDb();
}

function deleteItem(id) {
    db.run('DELETE FROM downloads WHERE id = ?', [id]);
    persistDb();
}

function getAllItems() {
    return queryAll('SELECT * FROM downloads ORDER BY datetime(createdAt) DESC');
}

function getItemById(id) {
    return queryOne('SELECT * FROM downloads WHERE id = ? LIMIT 1', [id]);
}

function getItemByFilename(filename) {
    return queryOne('SELECT * FROM downloads WHERE type = ? AND filename = ? LIMIT 1', ['file', filename]);
}

function queryAll(sql, params = []) {
    const stmt = db.prepare(sql, params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

function queryOne(sql, params = []) {
    const rows = queryAll(sql, params);
    return rows[0] || null;
}

function persistDb() {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function requireAdminAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({
            success: false,
            message: '未授权访问'
        });
    }

    const expiresAt = adminTokens.get(token);
    if (!expiresAt || Date.now() > expiresAt) {
        adminTokens.delete(token);
        return res.status(401).json({
            success: false,
            message: '登录已过期，请重新登录'
        });
    }

    return next();
}
