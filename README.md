# 工具下载服务器（Cloudflare Workers 版）

这是一个基于 Cloudflare Workers 的密码保护下载中心：

- 静态前端：`public/`
- 后端 API：`src/worker.js`
- 数据存储：KV（下载项/令牌/失败次数/初始化标记）+ R2（文件）

> 原本的 `server.js` 仍保留作为历史实现，但默认部署路径已切换至 Workers。

## 运行（Workers）

### 1. 安装 Wrangler

```bash
npm install
```

### 2. 创建资源

```bash
npx wrangler kv namespace create APP_KV
npx wrangler r2 bucket create downloads-uploads
```

将返回的 KV Namespace ID 填入 `wrangler.jsonc`。

### 3. 配置密钥

#### 方法一：Cloudflare Dashboard（推荐用于自动部署）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → 选择你的 Worker
3. 点击 **Settings** → **Variables and Secrets**
4. 添加以下环境变量（类型选择 **Secret**）：
   - `DOWNLOAD_PASSWORD` - 下载密码
   - `ADMIN_PASSWORD` - 管理员密码
   - `TURNSTILE_SECRET_KEY` - Turnstile 验证码密钥

> ⚠️ 在 Dashboard 中配置的 Secrets 会在每次 GitHub 自动部署后保留，无需在代码中暴露

#### 方法二：Wrangler CLI（本地部署）

```bash
npx wrangler secret put DOWNLOAD_PASSWORD
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put TURNSTILE_SECRET_KEY
```

如需关闭验证码，可在 `wrangler.jsonc` 中把 `TURNSTILE_ENABLED` 改为 `false`。

### 4. 本地开发

创建 `.dev.vars` 文件（参考 `.dev.vars.example`）：

```bash
DOWNLOAD_PASSWORD=your_password
ADMIN_PASSWORD=your_admin_password
TURNSTILE_SECRET_KEY=your_turnstile_key
```

> `.dev.vars` 文件已在 `.gitignore` 中排除，不会被提交到 Git

然后运行：

```bash
npx wrangler dev
# 或使用远程资源
npx wrangler dev --remote
```

### 5. 部署

```bash
npx wrangler deploy
```

## 默认文件说明

首次启动会在 KV 中写入默认下载项（RustDesk / Mumble）。
请将对应文件上传到 R2，文件名需与默认记录一致，或通过管理面板重新上传/替换。

## 功能

- ✅ 密码保护下载
- ✅ 管理员面板（新增链接/上传文件/删除）
- ✅ Token 验证机制（KV）
- ✅ 文件存储改为 R2
- ✅ Cloudflare Turnstile 验证码（可选）

