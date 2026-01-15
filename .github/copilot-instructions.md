# Copilot 指南（playdota2win）

## 项目概览

- 这是一个带密码保护的下载服务器：前端静态页（`index.html` + `styles.css` + `script.js`）+ 管理后台（`admin.html` + `admin.css` + `admin.js`）+ Node/Express API（`server.js`）。
- 数据层使用 `sql.js` + 本地文件持久化：`data/downloads.db`，启动时如为空会在 `server.js` 中写入默认下载项。

## 关键流程与边界

- 密码验证：`POST /api/verify-password`，失败次数达到 3 且启用 Turnstile 时要求验证码；成功后签发 1 小时 token（内存 Map）。
- 下载：`GET /api/download/:filename?token=...`，先查 `downloads.db`，再从 `uploads/` 或项目根目录读取文件；静态访问被禁止 `.exe` 直链。
- 管理后台：`/api/admin/login` 获取 2 小时 token；`/api/admin/files` 列表；`/api/admin/link` 新增链接；`/api/admin/upload` 上传文件到 `uploads/`；`DELETE /api/admin/files/:id` 删除资源并清理文件。

## 配置与外部依赖

- 关键环境变量：`DOWNLOAD_PASSWORD`、`ADMIN_PASSWORD`、`TURNSTILE_ENABLED`、`TURNSTILE_SECRET_KEY`、`PORT`（见 `README.md`）。
- Turnstile 站点 key 固定在 `script.js`；服务端用 `TURNSTILE_SECRET_KEY` 校验。
- 管理后台使用 `localStorage` 保存 token，API 请求以 `Authorization: Bearer <token>` 发送（见 `admin.js`）。

## 运行与部署

- 本地：`npm install` 后用 `npm start` 或 `npm run dev`（见 `package.json`）。
- 当前仓库未配置自动化测试脚本。
- Docker：`Dockerfile` 基于 `node:18-alpine`，默认启动 `server.js`，并带健康检查。
- K8s：`k8s/deployment.yaml` + `DEPLOY.md` 描述 ConfigMap/Secret、Ingress 与镜像地址。

## 修改提示

- 改 API 或数据结构时同步更新前端渲染逻辑（`script.js` 的 `renderCard` 与 `admin.js` 的 `renderRow`）。
- 任何与下载项相关的变更都要考虑 `downloads.db` 的持久化与 `seedDefaults()` 默认项。

## 调试（Playwright）

- 用途：本地调试前端页面与管理后台交互流程。
- 安装（一次性）：`npm install`，然后运行 `npx start`启动项目。
- 说明：调试时请先启动服务端（`npm start` / `npm run dev`），再运行 Playwright。
- MCP 调试：通过 MCP 触发 Playwright，请在本地环境自行配置并执行对应命令（仅作调试用途）。
