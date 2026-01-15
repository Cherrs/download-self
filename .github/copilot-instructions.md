# Copilot Guide (playdota2win)

## Project Overview

- Cloudflare Workers download server: static frontend in `public/` + admin panel in `public/` + Worker API in `src/worker.js`.
- Data layer uses D1 (SQLite) with schema in `migrations/`. If empty at startup, defaults are seeded in `src/worker.js`.

## Key Flows and Boundaries

- Password verification: when failures reach 3 and Turnstile is enabled, a captcha is required; on success, a 1-hour token is stored in KV.
- Download: `GET /api/download/:filename?token=...`. It checks D1, then reads from R2.
- Admin panel: `/api/admin/login` gets a 2-hour token in KV; `/api/admin/files` lists entries; `/api/admin/link` adds a link; `/api/admin/upload` uploads to R2; `DELETE /api/admin/files/:id` removes the resource and cleans up R2 objects.

## Configuration and External Dependencies

- Secrets/vars: `DOWNLOAD_PASSWORD`, `ADMIN_PASSWORD`, `TURNSTILE_ENABLED`, `TURNSTILE_SECRET_KEY` (see `README.md` and `wrangler.jsonc`).
- The Turnstile site key is fixed in `public/script.js`; the worker validates with `TURNSTILE_SECRET_KEY`.
- The admin panel stores the token in `localStorage`; API requests send `Authorization: Bearer <token>` (see `public/admin.js`).

## Run and Deploy

- Local: run `npx wrangler dev` (or `npx wrangler dev --remote`).
- Deploy: `npx wrangler deploy`.

## Change Notes

- When changing APIs or data structures, update frontend rendering logic in sync (`renderCard` in `public/script.js` and `renderRow` in `public/admin.js`).
- Any changes related to download items must consider D1 persistence and the seed defaults in `src/worker.js`.
- After each change, use Playwright to verify the modification behaves as expected.

## Debugging (Playwright)

- Purpose: locally debug frontend pages and admin interactions.
- Install (one-time): `npm install` (for Wrangler).
- Note: start the worker first (`npx wrangler dev`), then run Playwright.
- MCP debugging: trigger Playwright via MCP; configure and run the corresponding commands locally (for debugging only).
