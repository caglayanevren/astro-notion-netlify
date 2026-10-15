---
last_mapped_commit: 29a694fbbc547d803c7d51ed9eec950088f05efe
last_mapped_at: 2026-10-15
---
# External Integrations

**Analysis Date:** 2026-10-15

## APIs & External Services

**Content source:**
- Notion API (`api.notion.com`) - Single source of truth for blog posts; queried at build/sync time, no runtime calls from the public site
  - SDK/Client: `@notionhq/client` `5.27.0` (root, used by `scripts/sync-notion-images.mjs`); nested `2.3.0` used inside `@astro-notion/loader` (wired in `src/content.config.ts`)
  - Auth: env var `NOTION_TOKEN` (Notion internal integration token)
  - Endpoints used (`scripts/sync-notion-images.mjs`):
    - `client.databases.retrieve` (`:166`) - resolve data source
    - `client.dataSources.query` (`:183`) - pages filtered by `Status = Published`
    - `client.blocks.children.list` (`:198`) - recursive walk to collect `image` blocks
    - `client.pages.retrieve` (`:223`) - fetch `Image` cover property
  - Content schema expected in Notion database: `Name` (title), `Slug` (rich_text), `Date` (date), `Status` (select), `Summary` (rich_text), `Image` (files) — see `src/content.config.ts:18-31` and `README.md`
  - Optional override: `NOTION_DATA_SOURCE_ID` skips data-source resolution (`scripts/sync-notion-images.mjs:163`)

**Deployment platform:**
- Netlify - Hosting, SSR functions, build pipeline
  - SDK/Client: `@astrojs/netlify` `8.2.9` (adapter), `@netlify/blobs` `11.1.4` (storage)
  - Auth: `NETLIFY_SITE_ID`/`SITE_ID` + `NETLIFY_AUTH_TOKEN`/`NETLIFY_API_TOKEN` (script mode); automatic in-build context via `NETLIFY_BLOBS_CONTEXT`
  - Deploy badge wired to project `lovely-hamster-bf53e1` (`README.md:1`)

**Image hosts allowed for Astro optimization (`astro.config.js:29-35`):**
- `prod-files-secure.s3.us-west-2.amazonaws.com` - Notion-hosted file attachments
- `www.notion.so` - Notion-hosted images
- `https://**.amazonaws.com` (remote pattern) - Notion S3 signed URLs

## Data Storage

**Databases:**
- None - no SQL/NoSQL database. Notion IS the datastore
- Content Layer persistence: `.astro/data-store.json` (generated, git-ignored) managed by Astro

**File Storage:**
- Local filesystem: `src/assets/notion-generated/` (cover + body images staged by `scripts/sync-notion-images.mjs`, committed only as `.gitkeep`)
- Netlify Blobs: store name `notion-images` (`scripts/sync-notion-images.mjs:12`), key layout `covers/<pageId>/<lastEditedTime>` and `body/<pageId>/<blockId>/<lastEditedTime>` (`:68-78`)
- Generated index files (do not hand-edit): `src/assets/notion-image-manifest.json`, `src/assets/notion-image-assets.ts`, `src/assets/notion-body-image-assets.ts`

**Caching:**
- Netlify Blobs persistent cache for raw Notion image bytes; keeps last 2 versions per image (`keepBlobVersions = 2`), cleaned via `npm run prune:notion-images` (`scripts/sync-notion-images.mjs:14,329-338`)
- Local file reuse: previous manifest checked before re-downloading (`:250-258`); Blob access degrades gracefully with a warning when credentials are missing (`:117-124`)
- In-process memoization: `getNotionPosts()` caches the post list for the process lifetime (`src/utils/notion.ts:21,65-68`)
- No HTTP/CDN caching layer beyond Netlify's default edge CDN

## Authentication & Identity

**Auth Provider:**
- Custom / none for site visitors - the site is fully public; no user accounts, sessions, or identity provider detected
- Machine auth:
  - Notion: integration token via `NOTION_TOKEN`
  - Netlify: personal/access token via `NETLIFY_AUTH_TOKEN`
  - Inbound API: shared-secret query parameter — `src/pages/api/update.ts:7-11` compares `?secret=` against `UPDATE_SECRET`, returns `401` on mismatch

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Datadog, or similar in `package.json` or source)

**Logs:**
- `console.warn`/`console.error` in build scripts (`scripts/sync-notion-images.mjs`, debug lines in `src/utils/astronotionloaderpatch.ts:89,154,163`); surfaced via Netlify build logs
- Deploy status badge from `https://api.netlify.com/api/v1/badges/...` (`README.md:1`)

## CI/CD & Deployment

**Hosting:**
- Netlify - `output: 'server'` + `netlify()` adapter (`astro.config.js:9-10`); pages mostly `prerender = true`, API route `src/pages/api/update.ts` is SSR (`prerender = false`)

**CI Pipeline:**
- None detected - no `.github/` directory, no workflow files, no `netlify.toml`. Build command and env vars are configured in the Netlify UI; deploys trigger from Git pushes on `codex-main` (remote: `https://github.com/caglayanevren/astro-notion-netlify.git`)

## Environment Configuration

**Required env vars:**
- `NOTION_TOKEN` - Notion integration token (sync script + content loader)
- `NOTION_DATABASE_ID` - source database for the `blog` collection
- `UPDATE_SECRET` - shared secret guarding the rebuild endpoint
- `NETLIFY_HOOK_URL` - outbound Netlify build-hook URL

**Optional env vars:**
- `NETLIFY_SITE_ID` / `SITE_ID`, `NETLIFY_AUTH_TOKEN` / `NETLIFY_API_TOKEN` - explicit Blobs credentials when running the sync script outside Netlify
- `NETLIFY_BLOBS_CONTEXT` - auto-detected in-build Blobs context
- `NOTION_DATA_SOURCE_ID` - pin a specific Notion data source
- `BASE_URL` - Astro built-in (used in `src/utils/url-utils.ts:7`)

**Secrets location:**
- `.env` at project root (present; listed in `.gitignore` along with `.env.production`) - values never committed
- Matching values configured as environment variables in the Netlify UI (required for deploy/build-time sync); not stored anywhere else in the repo

## Webhooks & Callbacks

**Incoming:**
- `GET`/`POST /api/update?secret=<UPDATE_SECRET>` (`src/pages/api/update.ts`) - external trigger (e.g., Notion automation or manual call) that validates the secret and fires the Netlify build hook. Both methods delegate to the same `POST` handler (`:30-32`)
- No Notion webhook receivers — content changes propagate via rebuild-triggered re-query, not push events

**Outgoing:**
- Netlify build hook: `POST` to `import.meta.env.NETLIFY_HOOK_URL` (`src/pages/api/update.ts:16-18`) which queues a new deploy that re-runs `sync:notion-images` + `astro build`
- No other outbound webhooks/callbacks detected

---

*Integration audit: 2026-10-15*
