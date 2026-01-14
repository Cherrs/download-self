# 工具下载服务器

带密码保护的文件下载服务器

## 安装

```bash
npm install
```

## 配置

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

环境变量说明：
- `PORT` - 服务器端口（默认3000）
- `DOWNLOAD_PASSWORD` - 下载密码
- `TURNSTILE_SECRET_KEY` - Cloudflare Turnstile后端密钥
- `TURNSTILE_ENABLED` - 是否启用验证码（true/false）

## 运行

```bash
npm start
```

服务器将运行在配置的端口上

## 功能

- ✅ 密码保护下载
- ✅ 后端验证，安全可靠
- ✅ 弹窗式密码输入
- ✅ Token验证机制
- ✅ 文件白名单保护
- ✅ Cloudflare Turnstile验证码（可选）
- ✅ 环境变量配置
