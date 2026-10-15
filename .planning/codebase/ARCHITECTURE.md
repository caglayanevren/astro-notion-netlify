---
last_mapped_commit: 29a694fbbc547d803c7d51ed9eec950088f05efe
last_mapped_at: 2026-10-15
---
<!-- refreshed: 2026-10-15 -->

# Architecture

**Analysis Date:** 2026-10-15

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│  BUILD-TIME SYNC (standalone Node script, runs before dev/build)     │
│  `scripts/sync-notion-images.mjs`                                    │
│   Notion API ──► staged downloads ──► atomic replace                 │
└───────┬──────────────────────────────────────────────────────────────┘
        │ emits (gitignored, regenerated on every run)
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  GENERATED ASSET LAYER            `src/assets/`                      │
│  notion-generated/ (covers + body images)                            │
│  notion-image-manifest.json | notion-image-assets.ts                 │
│  notion-body-image-assets.ts                                         │
└───────┬──────────────────────────────────────────────────────────────┘
        │ read by
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  CONTENT LAYER (Astro Content Layer, build-time fetch from Notion)   │
│  `src/content.config.ts` ──► `src/utils/astronotionloaderpatch.ts`   │
│       └── wraps `@astro-notion/loader` notionLoader()                │
│       └── `src/utils/rehype-managed-notion-images.ts` (rehype pass)  │
│  store: `.astro/data-store.json`                                     │
└───────┬──────────────────────────────────────────────────────────────┘
        │ read by
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  DATA ACCESS / TRANSFORM                                             │
│  `src/utils/notion.ts`  (memoized post model)  `src/config.ts` (types)│
└───────┬──────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PRESENTATION (prerendered pages)                                    │
│  `src/pages/index.astro`  `src/pages/blog/[slug].astro`              │
│  └─ `src/layouts/Layout.astro`                                       │
│  └─ `src/components/ImageWrapper.astro`, `mainHeading.astro`         │
└───────┬──────────────────────────────────────────────────────────────┘
        │ astro build (output: 'server' + per-route `prerender = true`)
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  OUTPUT / DEPLOY                                                     │
│  `dist/` static HTML + hashed images  ──►  Netlify (@astrojs/netlify)│
│  `src/pages/api/update.ts` ──► Netlify Function (SSR endpoint)       │
└──────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Image sync script | Queries Notion for `Published` pages, downloads cover + body images, caches in local dir/Netlify Blobs, emits manifest + asset modules atomically | `scripts/sync-notion-images.mjs` |
| Collection definition | Declares the `blog` collection, `Status = Published` filter, Zod property schema | `src/content.config.ts` |
| Loader patch | Wraps third-party `notionLoader`: injects `last_edited_time` into entry data, registers external body images in `rendered.metadata.imagePaths`, migrates stale store records | `src/utils/astronotionloaderpatch.ts` |
| Rehype image rewrite | Replaces external Notion `<img>` srcs with local asset paths as `__ASTRO_IMAGE_` placeholders | `src/utils/rehype-managed-notion-images.ts` |
| Post model / data access | Turns content entries into `PostsType[]`, resolves cover image path from manifest, caches the promise for the build | `src/utils/notion.ts` |
| Shared types | `NotionPostItem`, `BlogPostDataType`, `PostsType`, `imageSavePath` | `src/config.ts` |
| Home page | Filters `Published`, sorts by date descending, renders list with covers | `src/pages/index.astro` |
| Post page | `getStaticPaths()` from slugs, renders Notion body HTML | `src/pages/blog/[slug].astro` |
| Rebuild endpoint | Validates `secret`, fires `NETLIFY_HOOK_URL` build hook | `src/pages/api/update.ts` |
| Cover image component | Looks up prepared asset, renders Astro `<Image>` as WebP | `src/components/ImageWrapper.astro` |
| Page shell | HTML skeleton, `lang="tr"`, meta, base styles | `src/layouts/Layout.astro` |
| Adapter & image config | Netlify adapter, `output: 'server'`, sharp service, allowed remote image domains | `astro.config.js` |

## Pattern Overview

**Overall:** Build-time content pipeline (sync → content layer → prerender), with a single SSR endpoint — an Astro "server output with per-route prerender" hybrid.

**Key Characteristics:**
- Content is authored in Notion, never in the repo; the repo holds rendering logic plus generated image assets.
- Every content/image fetch happens at build time; runtime serving is static HTML except `/api/update`.
- Third-party loader is adapted (not forked) through a wrapper that temporarily monkey-patches loader context hooks.
- Generated artifacts are staged then atomically renamed to keep builds idempotent and crash-safe.

## Layers

**Build sync tooling:**
- Purpose: fetch Notion images ahead of Astro so the bundler can statically import them.
- Location: `scripts/sync-notion-images.mjs`
- Contains: Notion client queries, download/retry/cache logic, manifest + asset-module codegen.
- Depends on: `@notionhq/client`, `@netlify/blobs`, Node `fs`/`crypto`.
- Used by: `npm run dev` and `npm run build` (via `sync:notion-images` npm script); also `prune:notion-images`.

**Generated asset layer:**
- Purpose: static import surface for images so Astro can hash/optimize them.
- Location: `src/assets/`
- Contains: `notion-generated/covers/*`, `notion-generated/body/**`, `notion-image-manifest.json`, `notion-image-assets.ts`, `notion-body-image-assets.ts`.
- Depends on: nothing (pure data/files).
- Used by: `src/utils/notion.ts` (manifest), `src/components/ImageWrapper.astro` (cover assets), `src/utils/astronotionloaderpatch.ts` + `src/utils/rehype-managed-notion-images.ts` (manifest, body paths).

**Content layer:**
- Purpose: pull typed, filtered Notion pages into Astro's content store.
- Location: `src/content.config.ts`, `src/utils/astronotionloaderpatch.ts`
- Contains: collection schema (Zod via `@astro-notion/loader/schemas`), loader wrapper, rehype plugin registration.
- Depends on: `astro:content`, `@astro-notion/loader`, `import.meta.env.NOTION_TOKEN`, `import.meta.env.NOTION_DATABASE_ID`.
- Used by: `src/utils/notion.ts` through `getCollection('blog')`.

**Data access:**
- Purpose: present pages with a stable, typed post model instead of raw collection entries.
- Location: `src/utils/notion.ts`, `src/config.ts`
- Contains: `getNotionPosts()` (module-level memoized promise), `getNotionPostData()`, cover-image resolution keyed on `${pageId}:${last_edited_time}`.
- Depends on: `astro:content`, `@astro-notion/loader`, `src/assets/notion-image-manifest.json`.
- Used by: `src/pages/index.astro`, `src/pages/blog/[slug].astro`.

**Presentation:**
- Purpose: render HTML.
- Location: `src/pages/`, `src/layouts/`, `src/components/`
- Contains: two prerendered routes, one SSR API route, one layout, two components.
- Depends on: data-access layer + path aliases `@components/*`, `@layouts/*`, `@utils/*`.
- Used by: Astro router / Netlify.

**Runtime server:**
- Purpose: trigger a Netlify rebuild on Notion changes.
- Location: `src/pages/api/update.ts`
- Contains: `POST`/`GET` handlers, secret check, build-hook fetch.
- Depends on: `import.meta.env.UPDATE_SECRET`, `import.meta.env.NETLIFY_HOOK_URL`.
- Used by: external caller (e.g. Notion automation/webhook).

## Data Flow

### Primary Request Path (build of a blog post)

1. `scripts/sync-notion-images.mjs:340` — loads `.env` values into `process.env`, creates Notion client, resolves data source id (`resolveDataSourceId`, line 161).
2. `scripts/sync-notion-images.mjs:359` — queries `Status = Published` pages, walks blocks for body images, prepends the cover (`getPageImages`, line 221).
3. `scripts/sync-notion-images.mjs:362` — per image: reuse local copy if manifest key matches → else Netlify Blobs → else download from Notion (3 retries, magic-byte check), staged into `src/assets/notion-generated.staging-<uuid>`.
4. `scripts/sync-notion-images.mjs:383-394` — writes manifest + `notion-image-assets.ts` + `notion-body-image-assets.ts`, then atomically swaps directories/files (`replaceDirectory`, line 303).
5. `src/content.config.ts:7` — `astroNotionLoaderPatch({ auth, database_id, filter })` runs during `astro sync`/`astro build`, fetching page bodies from Notion.
6. `src/utils/astronotionloaderpatch.ts:61-119` — wraps `ctx.parseData` (injects `last_edited_time`) and `ctx.store.set` (merges external body image paths into `rendered.metadata.imagePaths` + `assetImports`).
7. `src/utils/rehype-managed-notion-images.ts:36-51` — rewrites matching external `<img src>` to `../../assets/notion-generated/<file>` wrapped in `__ASTRO_IMAGE_`, so Astro's content-image transform rewrites it at build.
8. `src/utils/notion.ts:65` — `getNotionPosts()` memoizes `loadNotionPosts()`, which maps entries through `getNotionPostData()` and resolves the cover path from the manifest (`getImageAssetPath`, line 30).
9. `src/pages/blog/[slug].astro:8-14` — `getStaticPaths()` emits one route per `Slug`; line 24 renders `post.rendered.Content` inside `Layout`.
10. `astro build` → `dist/blog/<slug>/index.html` + hashed images in `dist/_astro/`, deployed by Netlify.

### Content Update / Rebuild Flow

1. Editor sets a Notion page's `Status` to `Published`.
2. Caller hits `GET|POST /api/update?secret=<UPDATE_SECRET>` (`src/pages/api/update.ts:30` / `:5`).
3. Handler compares `secret` to `import.meta.env.UPDATE_SECRET` (line 10), then `fetch`es `import.meta.env.NETLIFY_HOOK_URL` (line 16).
4. Netlify starts a new build → step 1 of the primary path runs again → new deployment carries the updated content.

### Cover Image Selection at Render Time

1. Manifest entries are indexed by `` `${pageId}:${lastEditedTime}` `` (`src/utils/notion.ts:24`).
2. The key is rebuilt from `post.id` + `post.data.last_edited_time` (line 31) — the value the loader patch forces into entry data.
3. Match returns `/src/assets/notion-generated/<fileName>`, which `ImageWrapper.astro` resolves through `notionImageAssets` and renders as optimized WebP.

**State Management:**
- No client-side state; no JS hydration anywhere (no framework integrations installed).
- Build-time memoization: `let postsPromise` in `src/utils/notion.ts:21` caches posts for the process lifetime.
- Content store persistence: `.astro/data-store.json` (generated, gitignored) lets the loader skip unchanged pages via `digest`.
- Image cache: local `src/assets/notion-generated/` (primary) + Netlify Blobs store `notion-images` (secondary, optional, keeps 2 versions per identity with `--prune`).

## Key Abstractions

**`astroNotionLoaderPatch(options): Loader`:**
- Purpose: compatibility adapter over `@astro-notion/loader` that (a) exposes `last_edited_time` as data, (b) registers external body images so Astro rewrites their placeholders, (c) migrates older store records.
- Examples: `src/utils/astronotionloaderpatch.ts`, wired in `src/content.config.ts:7`
- Pattern: decorator/wrapper — spreads the original loader, overrides `createSchema` and `load`, temporarily monkey-patches `ctx.parseData`/`ctx.store.set` inside `load` and restores them in `finally`.

**`NotionImageManifest` (version 2):**
- Purpose: single source of truth mapping Notion page/block image revisions to local file names and Blob keys.
- Examples: `src/assets/notion-image-manifest.json`, typed inline in `src/utils/notion.ts:15` and `src/utils/astronotionloaderpatch.ts:6`
- Pattern: generated JSON manifest consumed by both runtime transform code and the sync script (which reads it back to skip re-downloads).

**Asset module maps (`notionImageAssets`, `notionBodyImageAssets`):**
- Purpose: give Vite static-importable references so images become hashed build assets.
- Examples: `src/assets/notion-image-assets.ts`, `src/assets/notion-body-image-assets.ts`
- Pattern: generated barrel of `import imageN from './notion-generated/...'` keyed by absolute source path string.

**`PostsType` / `BlogPostDataType`:**
- Purpose: the typed post shape pages consume.
- Examples: `src/config.ts:8-26`, produced by `src/utils/notion.ts:53`
- Pattern: view-model derived from collection entries (`Awaited<ReturnType<typeof getCollection<'blog'>>>[number]` for the raw item).

**`retry(operation, label)`:**
- Purpose: uniform transient-failure handling for all Notion/network calls in the sync script.
- Examples: `scripts/sync-notion-images.mjs:126`
- Pattern: 3 attempts, exponential backoff `400 * 2**attempt + jitter`.

## Entry Points

**npm scripts (`package.json`):**
- Location: `package.json:5-14`
- Triggers: `npm run dev` (sync + astro dev), `npm run build` (sync + `astro sync` + `astro build`), `npm run sync:notion-images`, `npm run prune:notion-images` (Blob GC), `npm run preview`, `npm run clean`/`clear`.
- Responsibilities: the sync script is always the first step of dev/build — this ordering is an architectural requirement, not optional.

**Route entry points (`src/pages/`):**
- Location: `src/pages/index.astro` (`prerender = true`), `src/pages/blog/[slug].astro` (`prerender = true`, `getStaticPaths`), `src/pages/api/update.ts` (`prerender = false`).
- Triggers: HTTP request at runtime / static file serving after build.
- Responsibilities: page composition (index) and post rendering (slug) are static; only `/api/update` executes server-side.

**Collection entry point:**
- Location: `src/content.config.ts`
- Triggers: `astro sync` and `astro build` (and `astro dev` startup).
- Responsibilities: registers the `blog` collection and its Notion-backed loader/schema.

**Configuration entry point:**
- Location: `astro.config.js`
- Triggers: every Astro CLI invocation.
- Responsibilities: `output: 'server'`, `adapter: netlify()`, sharp image service with `limitInputPixels: false`, remote image domains `prod-files-secure.s3.us-west-2.amazonaws.com` and `www.notion.so` plus `**.amazonaws.com` patterns.

**Environment contract (values never read into docs):**
- Required for sync/build: `NOTION_TOKEN`, `NOTION_DATABASE_ID` (`scripts/sync-notion-images.mjs:341-342`, `src/content.config.ts:8-9`).
- Required for the API route: `UPDATE_SECRET`, `NETLIFY_HOOK_URL` (`src/pages/api/update.ts:10,16`).
- Optional: `NETLIFY_SITE_ID`/`SITE_ID` + `NETLIFY_AUTH_TOKEN`/`NETLIFY_API_TOKEN` or `NETLIFY_BLOBS_CONTEXT` for Blobs caching (`scripts/sync-notion-images.mjs:117-124`); `NOTION_DATA_SOURCE_ID` to skip database lookup (`scripts/sync-notion-images.mjs:163`).
- A `.env` file exists at the repo root (contents not inspected); the sync script self-loads it (`loadLocalEnv`, line 16) while Astro reads it through Vite.

## Architectural Constraints

- **Rendering mode:** `astro.config.js` sets `output: 'server'`, so any new route is **SSR by default**; pages must explicitly `export const prerender = true` to be static (see `src/pages/index.astro:2`, `src/pages/blog/[slug].astro:2`). Only `src/pages/api/update.ts` opts out (`prerender = false`).
- **Threading/concurrency:** single-threaded Node. The sync script caps parallel Notion/download work at `concurrency = 4` via `mapWithConcurrency` (`scripts/sync-notion-images.mjs:13,290`).
- **Global state:** module-level `postsPromise` in `src/utils/notion.ts:21` (persists for the process; safe today because consuming routes are prerendered). Module-level derived maps over the manifest in `src/utils/notion.ts:24` and `src/utils/astronotionloaderpatch.ts:15` are computed once at import time — they assume the manifest is stable during a process run.
- **Generated files must not be hand-edited:** `src/assets/notion-generated/*`, `src/assets/notion-image-manifest.json`, `src/assets/notion-image-assets.ts`, `src/assets/notion-body-image-assets.ts` are gitignored (`.gitignore:31-35`) and regenerated by `sync:notion-images`, which runs automatically in `dev` and `build`. Running `astro build` directly without syncing will fail or use stale data (`ImageWrapper.astro:26-30` throws when an asset is missing).
- **Circular imports:** none detected. Dependency direction is `pages → utils/config → content layer → generated assets`; `src/config.ts` only imports types from `astro:content`.
- **Path aliases:** `@components/*`, `@layouts/*`, `@utils/*` (`tsconfig.json:7-9`). There is **no** alias for `src/assets` or `src/config` — those are always imported relatively (`../config`, `../assets/...`); keep that split.
- **Atomicity requirement:** image sync writes to `*.staging-<uuid>` paths and renames (`scripts/sync-notion-images.mjs:303-317,384-394`); failure removes the staging dir and leaves previous output intact (line 397). Preserve this when editing the script.
- **Loader wrapper fragility:** `astronotionloaderpatch.ts` depends on undocumented internals of `@astro-notion/loader` (`loader.schema`, `ctx.parseData`, `ctx.store.set`, `entry.digest`). An upgrade of that package requires re-validating this file.

## Anti-Patterns

### Leftover debug logging in the loader patch

**What happens:** `console.error('[DEBUG set] ...')` / `[DEBUG migration]` statements emit on every build for entries with body images (`src/utils/astronotionloaderpatch.ts:89,154,163`).
**Why it's wrong:** stderr noise on every build hides real failures and suggests transient debugging shipped to production paths.
**Do this instead:** route through a guarded logger (e.g. only when `process.env.DEBUG_NOTION_IMAGES` is set) or remove once the migration path is confirmed stable.

### Dead / divergent code paths

**What happens:** `src/utils/url-utils.ts` is never imported; `imageSavePath` in `src/config.ts:4` (`"assets/notion"`) is never used while the loader patch hardcodes `'assets/notion-generated/body'` (`src/utils/astronotionloaderpatch.ts:35`); `notionBodyImageAssets` is generated but no source file imports it.
**Why it's wrong:** two sources of truth for the image save path will drift; dead modules mislead contributors about where behavior lives.
**Do this instead:** delete `url-utils.ts` if unused, and derive the loader's `imageSavePath` from a single exported constant in `src/config.ts`.

### Inline styles instead of the component stylesheet

**What happens:** `src/pages/index.astro:23-36` uses raw `style="..."` attributes for list layout while the only styled block is the `<style>` in `src/layouts/Layout.astro:16`.
**Why it's wrong:** styling is scattered across templates, un-reusable across pages, and invisible to any future CSS tooling.
**Do this instead:** move rules into scoped `<style>` blocks or a shared stylesheet referenced from `Layout.astro`, keeping markup semantic.

### Stale comments/paths in docs and code

**What happens:** README's file guide points at `src/components/misc/ImageWrapper.astro`, but the file lives at `src/components/ImageWrapper.astro`; `src/pages/blog/[slug].astro:5` keeps a commented-out import from the old path; `astro.config.js:5-21` carries a disabled Cloudflare adapter block.
**Why it's wrong:** send contributors to nonexistent paths and bury the active configuration among alternatives.
**Do this instead:** keep one active adapter config and delete commented alternatives; update README paths whenever files move.

### Rebuild endpoint secrets via query string

**What happens:** `GET`/`POST /api/update?secret=...` passes the shared secret in the URL and `GET` simply delegates to `POST` (`src/pages/api/update.ts:30-32`).
**Why it's wrong:** query strings land in access logs and referrer headers; a `GET` that mutates state (triggers a build) is also crawlable.
**Do this instead:** require `POST` with the secret in a header (e.g. `x-update-secret`) and return 405 for `GET`.

## Error Handling

**Strategy:** fail fast and atomically at build time; degrade gracefully for optional caches (Netlify Blobs); minimal JSON error responses at runtime.

**Patterns:**
- Retry with exponential backoff + jitter, 3 attempts, for every Notion/network operation (`scripts/sync-notion-images.mjs:126-140`).
- Response validation before use — magic-byte image sniffing (`isImageBuffer`, line 105) rejects HTML error pages masquerading as images.
- Staging-then-rename with rollback: failed sync deletes staging, restores backup directory (`replaceDirectory` line 303, `catch` line 397).
- Per-image fallback: if a current image can't be prepared, the previous manifest version is copied and marked `stale: true` so it will be retried next run (`scripts/sync-notion-images.mjs:366-379`).
- Blob failures are warnings, never fatal (lines 267-282); missing Blobs credentials warn and continue without a persistent cache (line 122).
- Required env vars throw immediately with a named error (`requiredEnvironment`, line 30).
- Component-level guard: `ImageWrapper.astro:26-30` throws an instructive error telling the developer to run `sync:notion-images`.
- API route: 401 on bad secret, 500 on hook/network failure, JSON bodies (`src/pages/api/update.ts:10-27`); note the `catch` swallows the underlying error detail.

## Cross-Cutting Concerns

**Logging:** `console.warn`/`console.error` in the sync script and loader patch; no logging library; no logging in page/component code. UI strings and comments are Turkish (`lang="tr"` in `src/layouts/Layout.astro:2`).

**Validation:** Zod schemas from `@astro-notion/loader/schemas` (`notionPageSchema`, `propertySchema`, `transformedPropertySchema`) in `src/content.config.ts:18-33`, extended with `last_edited_time: z.string()`; `Status = Published` filtered twice — server-side in the loader (`content.config.ts:11-16`) and defensively again in `src/pages/index.astro:12`.

**Authentication:** Notion access via `NOTION_TOKEN` bearer token; rebuild endpoint via shared `UPDATE_SECRET` query param; Netlify Blobs via `NETLIFY_AUTH_TOKEN`. No user-facing auth (static site).

**Image processing:** Astro `<Image>` with sharp (`astro/assets/services/sharp`, `limitInputPixels: false`), output WebP quality 80 at widths `[400, 800, 1200]` (`src/components/ImageWrapper.astro:17,37-38`); body images handled by Astro's content-image transform rather than a component.

---

*Architecture analysis: 2026-10-15*
