# 工具下载服务器（Cloudflare Workers 版）

这是一个基于 Cloudflare Workers 的密码保护下载中心：
- 静态前端：`public/`
- 后端 API：`src/worker.js`
- 数据存储：D1（下载项）+ R2（文件）+ KV（令牌/失败次数/初始化标记）

> 原本的 `server.js` 仍保留作为历史实现，但默认部署路径已切换至 Workers。

## 运行（Workers）

### 1. 安装 Wrangler

```bash
npm install
```

### 2. 创建资源

```bash
npx wrangler d1 create downloads-db
npx wrangler kv namespace create APP_KV
npx wrangler r2 bucket create downloads-uploads
```

将返回的 D1 数据库 ID / KV Namespace ID 填入 `wrangler.jsonc`。

### 3. 初始化数据库

```bash
npx wrangler d1 execute downloads-db --remote --file=./migrations/0001_schema.sql
```

### 4. 配置密钥

```bash
npx wrangler secret put DOWNLOAD_PASSWORD
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put TURNSTILE_SECRET_KEY
```

如需关闭验证码，可在 `wrangler.jsonc` 中把 `TURNSTILE_ENABLED` 改为 `false`。

### 5. 本地开发 / 远程调试

```bash
npx wrangler dev
# 或使用远程资源
npx wrangler dev --remote
```

### 6. 部署

```bash
npx wrangler deploy
```

## 默认文件说明

首次启动会在 D1 中写入默认下载项（RustDesk / Mumble）。
请将对应文件上传到 R2，文件名需与默认记录一致，或通过管理面板重新上传/替换。

## 功能

- ✅ 密码保护下载
- ✅ 管理员面板（新增链接/上传文件/删除）
- ✅ Token 验证机制（KV）
- ✅ 文件存储改为 R2
- ✅ Cloudflare Turnstile 验证码（可选）

