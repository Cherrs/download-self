const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// 从环境变量读取配置，提供默认值
const PORT = process.env.PORT || 3000;
const DOWNLOAD_PASSWORD = process.env.DOWNLOAD_PASSWORD;
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const TURNSTILE_ENABLED = process.env.TURNSTILE_ENABLED === 'true' || false;

// 失败次数记录
const failedAttempts = new Map();

// 有效的token集合（token -> 过期时间）
const validTokens = new Map();

// 定期清理过期token（每10分钟执行一次）
setInterval(() => {
    const now = Date.now();
    for (const [token, expiresAt] of validTokens.entries()) {
        if (now > expiresAt) {
            validTokens.delete(token);
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
    }

    if (password === DOWNLOAD_PASSWORD) {
        // 密码正确，清除失败记录
        failedAttempts.delete(clientIp);

        // 生成一个token并设置过期时间（1小时）
        const token = Buffer.from(`${Date.now()}-${Math.random()}`).toString('base64');
        const expiresAt = Date.now() + 60 * 60 * 1000; // 1小时后过期
        validTokens.set(token, expiresAt);
        
        res.json({
            success: true,
            token: token,
            message: '密码正确'
        });
    } else {
        // 密码错误，增加失败次数
        failedAttempts.set(clientIp, attempts + 1);

        res.status(401).json({
            success: false,
            message: '密码错误',
            requireCaptcha: TURNSTILE_ENABLED && (attempts + 1) >= 3
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
app.get('/api/download/:filename', (req, res) => {
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

    // 允许下载的文件列表
    const allowedFiles = [
        'rustdesk-1.4.5-x86_64.exe',
        'mumble_client-1.5.857.x64.exe'
    ];

    if (!allowedFiles.includes(filename)) {
        return res.status(404).json({
            success: false,
            message: '文件不存在'
        });
    }

    const filePath = path.join(__dirname, filename);

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

app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log(`下载密码: ${DOWNLOAD_PASSWORD}`);
});
