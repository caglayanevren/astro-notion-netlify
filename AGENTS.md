<!-- GSD:project-start source:PROJECT.md -->

## Project

**Astro Notion Blog Pipeline**

A personal blog/content site that pulls content from a Notion database (currently dummy data), keeps itself fresh via a Notion webhook, and renders pages with Astro on Netlify. It started as an experiment to validate the Notion → web data flow; before building out the frontend, the pipeline must be proven reliable and error-free.

**Core Value:** The Notion → website data flow (fetch, update via webhook, render in Astro) must work correctly and be verifiably so — everything else waits on this.

### Constraints

- **Tech stack**: Astro + Netlify + `@astro-notion/loader` + `@netlify/blobs` — the existing prototype works; harden, don't rewrite
- **Security**: secrets must never live in the repo, URLs, or query strings — the current `?secret=` pattern is a known issue this project fixes
- **Testing**: automated tests must not call the live Notion API or require real secrets — mocks and fixtures only
- **Scope**: no new user-facing features during this project — stabilization only

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript (strict) - Application code: `src/**/*.ts`, `src/**/*.astro` frontmatter, enabled via `astro/tsconfigs/strict` + `strictNullChecks: true` (`tsconfig.json`)
- Astro Component syntax (`.astro`) - Pages and components: `src/pages/index.astro`, `src/pages/blog/[slug].astro`, `src/layouts/Layout.astro`, `src/components/ImageWrapper.astro`, `src/components/mainHeading.astro`
- JavaScript (ESM, `"type": "module"`) - Build tooling script `scripts/sync-notion-images.mjs`, config `astro.config.js`
- Markdown/HTML - Blog bodies come pre-rendered as HTML from Notion via the content loader (no local `.md` content files)

## Runtime

- Node.js v24.21.0 (local development; no `engines` field in `package.json` and no `.nvmrc`/`.node-version` in repo)
- Deployment runtime: Netlify Functions (SSR) for `src/pages/api/update.ts`; static prerender for pages
- No runtime version pinned in repo — Netlify build image settings live in the Netlify UI (there is no `netlify.toml`)
- npm 12.2.0
- Lockfile: present (`package-lock.json`, lockfileVersion 3)

## Frameworks

- Astro `7.3.8` (declared `^7.3.8`) - Static site generator with Content Layer; `output: 'server'` in `astro.config.js` with per-page `export const prerender = true`
- `@astrojs/netlify` `8.2.9` (declared `^8.2.9`) - Netlify adapter (`astro.config.js:10`)
- `@astro-notion/loader` `1.1.2` (devDependency) - Notion content-layer loader, wrapped by `src/utils/astronotionloaderpatch.ts`
- Not detected - no test framework, no test files, no `test` script in `package.json`
- npm scripts (`package.json`):
- Sharp image service - explicit entrypoint `astro/assets/services/sharp` with `limitInputPixels: false` (`astro.config.js:22-36`)

## Key Dependencies

- `@notionhq/client` `5.27.0` - Official Notion API client; used by `scripts/sync-notion-images.mjs`. Note: `@astro-notion/loader` bundles its own nested `@notionhq/client` `2.3.0` (`node_modules/@astro-notion/loader/node_modules/@notionhq/client`), so two major SDK versions coexist
- `@astro-notion/loader` `1.1.2` - Loads the `blog` collection from Notion in `src/content.config.ts`; pulls in `unified` `11.0.5`, `notion-rehype-k`, `rehype-katex`, `rehype-slug`, `@jsdevtools/rehype-toc`, `slug`, `fs-extra`, `kleur`
- `@netlify/blobs` `11.1.4` - Persistent image cache store `notion-images` in `scripts/sync-notion-images.mjs`
- `astro` `7.3.8` - Framework; also provides `astro:content`, `astro:assets`
- `sharp` `0.35.5` - Image optimization (WebP output at `quality: 80`, widths `[400, 800, 1200]` in `src/components/ImageWrapper.astro`)
- `zod` `4.6.6` - Collection schema validation (via `astro:content` `z` in `src/content.config.ts`)
- `esbuild` `0.28.1` - Build pipeline (transitive via Astro)

## Configuration

- `.env` file at project root (present, git-ignored) — local secrets; contents never committed. `scripts/sync-notion-images.mjs:16-28` parses `.env` manually for build-time scripts; Astro exposes the same vars to app code via `import.meta.env`
- Required vars: `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `UPDATE_SECRET`, `NETLIFY_HOOK_URL`
- Optional vars: `NETLIFY_SITE_ID`/`SITE_ID`, `NETLIFY_AUTH_TOKEN`/`NETLIFY_API_TOKEN`, `NOTION_DATA_SOURCE_ID`, `NETLIFY_BLOBS_CONTEXT`
- Runtime usage: `src/content.config.ts:8-9` (`NOTION_TOKEN`, `NOTION_DATABASE_ID`), `src/pages/api/update.ts:10,16` (`UPDATE_SECRET`, `NETLIFY_HOOK_URL`), `src/utils/url-utils.ts:7` (`BASE_URL`, Astro built-in)
- `astro.config.js` - `output: 'server'`, `netlify()` adapter, sharp image service, allowed image hosts: `prod-files-secure.s3.us-west-2.amazonaws.com`, `www.notion.so`, remote pattern `https://**.amazonaws.com` (a commented-out Cloudflare adapter block also exists)
- `tsconfig.json` - extends `astro/tsconfigs/strict`; path aliases `@components/*`, `@layouts/*`, `@utils/*`
- No `netlify.toml`, no `.github/workflows`, no ESLint/Prettier/Biome/editorconfig config files, no Husky — Netlify build settings are configured outside the repo
- `.vscode/extensions.json` (recommends `astro-build.astro-vscode`), `.vscode/launch.json` (launches `astro dev`)
- `opencode.jsonc` - OpenCode CLI config only (not part of the site build)

## Generated / Committed Artifacts

- `src/assets/notion-generated/` - synced cover + body images; git-ignored except `.gitkeep` (`.gitignore`)
- `src/assets/notion-image-manifest.json`, `src/assets/notion-image-assets.ts`, `src/assets/notion-body-image-assets.ts` - emitted by `scripts/sync-notion-images.mjs`; git-ignored, never hand-edited
- `.astro/` (incl. `data-store.json` content-layer store), `dist/`, `.netlify/`, `graphify-out/` - all git-ignored

## Platform Requirements

- Node 24.x + npm 12 (observed), `npm install`, then `npm run dev` (runs Notion image sync first — requires `.env` with `NOTION_TOKEN`/`NOTION_DATABASE_ID`)
- Netlify (site project `lovely-hamster-bf53e1` per README deploy badge)
- Build command follows the `build` npm script (image sync → `astro sync` → `astro build`); adapter emits Netlify Functions + Edge/CDN static assets
- GitHub remote: `https://github.com/caglayanevren/astro-notion-netlify.git` (active branch `codex-main`)

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Components (`.astro`): inconsistent casing — both PascalCase and camelCase exist:
- Utilities (`.ts`): mixed styles — `src/utils/notion.ts`, `src/utils/url-utils.ts` (kebab-case), `src/utils/astronotionloaderpatch.ts` (lowercase, no separators), `src/utils/rehype-managed-notion-images.ts` (kebab-case). Prefer **kebab-case** for new utils (`url-utils.ts`, `rehype-managed-notion-images.ts` are the strongest examples).
- Routes: Astro convention — `src/pages/blog/[slug].astro` for dynamic params, plain names for static (`src/pages/index.astro`), API routes as `.ts` with HTTP-method exports (`src/pages/api/update.ts`).
- Scripts: kebab-case `.mjs` — `scripts/sync-notion-images.mjs`.
- Generated files: `src/assets/notion-image-manifest.json`, `src/assets/notion-image-assets.ts`, `src/assets/notion-body-image-assets.ts` — always prefixed `notion-`, never hand-edited (see `.gitignore` and README "Koda katkı için dosya rehberi").
- camelCase: `getNotionPosts`, `loadNotionPosts`, `getNotionPostData`, `syncImage`, `imageKey`, `blobKey`, `safeFileSegment`, `mapWithConcurrency`.
- Data-shaping helpers use verb-first naming: `loadPreviousManifest`, `renderAssetModule`, `normalizeSourceUrl`.
- Route handlers are named after HTTP verbs: `export const POST: APIRoute`, `export const GET: APIRoute` (`src/pages/api/update.ts`).
- camelCase for locals and module-level state: `imagesByRevision`, `postsPromise`, `externalBodyImages`, `stagingDirectory`.
- SCREAMING_SNAKE_CASE for env-derived constants is not used; env vars are read inline (`import.meta.env.NOTION_TOKEN`, `process.env.NETLIFY_AUTH_TOKEN`).
- Notion property names are preserved verbatim (PascalCase) as data keys: `Name`, `Slug`, `Date`, `Status`, `Summary`, `Image` (`src/config.ts`, `src/content.config.ts`).
- PascalCase, often suffixed with `Type`, `DataType`, or `Item`: `BlogPostDataType`, `PostsType`, `NotionPostItem`, `NotionImageManifestEntry`, `ManagedImage`, `ManagedBodyImage` (`src/config.ts`, `src/utils/notion.ts`, `src/utils/astronotionloaderpatch.ts`).
- Astro component props use `interface Props` with JSDoc-style inline comments (`src/components/ImageWrapper.astro:5`).
- Derived types from loaders: `type NotionPostItem = Awaited<ReturnType<typeof getCollection<'blog'>>>[number]` (`src/config.ts:6`).
- Zod schemas compose `notionPageSchema({ properties: z.object({...}) }).extend({...})` (`src/content.config.ts`).

## Code Style

- **No formatter configured** (no `.prettierrc`, `biome.json`, or `.editorconfig` in repo root). Existing indentation is mixed:
- Match the file you are editing; when creating new files, use **4 spaces for `.ts`** and **tabs for `.astro` frontmatter/markup** to match nearest neighbors.
- Single quotes preferred in TS (`import type { APIRoute } from 'astro'`), but double quotes appear in `.astro` imports (`import Layout from "@layouts/Layout.astro"`) and in `src/config.ts` (`"assets/notion"`). Both occur; single quotes are the majority in `.ts`.
- Trailing commas used in multiline calls/lists (`src/utils/notion.ts`, `astro.config.js`).
- **No ESLint/Prettier/Biome config or dependency exists** (only a transitive eslint string in `package-lock.json`). No lint script in `package.json`.
- Type safety comes from `astro/tsconfigs/strict` + `strictNullChecks: true` in `tsconfig.json`; `allowJs: true` covers `.astro`/`.js`.
- `astro.config.js` starts with `// @ts-check` — keep that pattern for new root config JS.
- Avoid `as any` — it currently exists only in `src/utils/astronotionloaderpatch.ts` (`:38`, `:44`, `:61`, `:76`) as a workaround for untyped loader internals; do not spread it to other files.

## Import Organization

- Defined in `tsconfig.json` `compilerOptions.paths`:
- **No alias exists for `src/config.ts` or `src/assets/`** — those are imported relatively (`src/pages/index.astro:8` uses `'../config'`; `src/utils/notion.ts:3` uses `'../assets/notion-image-manifest.json'`). Keep using relative imports for those, or add an alias in `tsconfig.json` if introducing one.
- Type-only imports use inline `type` modifier: `import { type PostsType, type BlogPostDataType } from '../config'` (`src/utils/notion.ts:4`) or `import type { Loader } from 'astro/loaders'`.

## Error Handling

- **Fail fast with descriptive `Error` for unrecoverable conditions** (build-time):
- **ENOENT-as-fallback**: file-not-found is handled silently (returns `false`/default) while other errors rethrow — `loadLocalEnv` (`scripts/sync-notion-images.mjs:25-27`), `loadPreviousManifest` (`:155-157`), `copyIfPresent` (`:244-247`), `replaceDirectory` (`:307-309`).
- **Retry with exponential backoff + jitter** for all network calls via `retry(operation, label)` — 3 attempts, `400 * 2**attempt + random(0..200)` ms delay (`scripts/sync-notion-images.mjs:126-140`). Wrap Notion API and image downloads in it.
- **Degrade gracefully with `console.warn`** for optional infrastructure: missing Netlify Blobs credentials (`:122`), failed blob read/write (`:270`, `:280`), invalid cached blob (`:266`), stale-image fallback (`:371`).
- **HTTP endpoint**: manual `Response` construction with status codes and JSON `{ message }` payloads; catch-all returns 500 without logging the error (`src/pages/api/update.ts:14-27`). Secret check is a plain `!==` comparison against `import.meta.env.UPDATE_SECRET` returning 401.
- **Cleanup in `finally` / staged writes**: loader patch restores monkey-patched functions in `try/finally` (`src/utils/astronotionloaderpatch.ts:121-126`); sync script writes to `*.staging-<uuid>` paths and swaps atomically, removing the staging dir in `catch` (`scripts/sync-notion-images.mjs:353-399`).

## Logging

- `console.log` for the one final success summary (`scripts/sync-notion-images.mjs:396`).
- `console.warn` for recoverable/fallback situations in scripts — always includes the failing key/id and the fallback action (`scripts/sync-notion-images.mjs:135`, `:270`, `:280`, `:371`).
- `console.error` with `[DEBUG ...]` prefixes in `src/utils/astronotionloaderpatch.ts:89`, `:154`, `:163` — these are diagnostic traces for loader/store state; if adding new ones, keep the `[DEBUG <phase>] id=<entryId> ...` shape, and treat removal of these as cleanup, not as a pattern to copy into new features.
- Human-facing API messages are written in Turkish (`src/pages/api/update.ts:11`, `:21`), matching the Turkish UI (`<html lang="tr">`, README).

## Comments

- Comments explain **why a workaround exists**, not what the code does — especially around upstream-loader quirks. See the multi-line rationale blocks in `src/utils/astronotionloaderpatch.ts:57-60`, `:71-74`, `:94-99`, `:129-131`, `:147-150`.
- Brief inline notes mark build-generated or optional fields: `// Converts to a primitive string` (`src/content.config.ts:21`), `// Şifre kontrolü` (`src/pages/api/update.ts:9`).
- Language is mixed Turkish/English: UI and API comments in Turkish (`src/pages/index.astro:11`, `src/pages/blog/[slug].astro:17`), technical/loader comments in English. Match the language of the surrounding file.
- No TODO/FIXME/HACK markers exist anywhere in `src/` or `scripts/`.
- One TSDoc-style block comment exists for the rehype plugin (`src/utils/rehype-managed-notion-images.ts:24-27`) — use this form for exported transforms/plugins.
- Component props documented as short trailing comments on each field (`src/components/ImageWrapper.astro:5-12`).
- No `@param`/`@returns` tags anywhere; do not introduce heavy JSDoc.

## Function Design

- Prefer an options object for functions with 3+ inputs: `syncImage({ image, store, previousByKey, stagingDirectory })` (`scripts/sync-notion-images.mjs:250`).
- Pure helpers take primitives and return strings/booleans (`safeFileSegment(value)`, `extensionFromUrl(url)`).
- Rehype plugins are factory functions returning the transformer: `rehypeManagedNotionImages(images)` → `(tree) => {...}` (`src/utils/rehype-managed-notion-images.ts:28-53`).
- Async functions return `Promise<T>` with explicit type annotations in TS (`src/utils/notion.ts:35`, `:53`).
- Failures throw; optional data returns `undefined`/`null` (`getImageAssetPath` returns `string | undefined`, `createStore` returns `null`).
- Mutation-free data shaping: new objects are built with spreads (`src/utils/astronotionloaderpatch.ts:78-85`).

## Module Design

- Named exports everywhere; **no default exports** in `.ts` files (only Astro components export implicitly).
- Barrel/index files: **not used** — import directly from the specific module.
- Public surface of `src/utils/notion.ts` is just `getNotionPostData` + `getNotionPosts`; `loadNotionPosts` stays private (module-level memoization via `postsPromise ??= ...` at `:21`, `:66`). Follow this: cache build-wide async data at module scope and expose a single getter.
- Env access convention: `import.meta.env.*` inside `src/`, `process.env.*` inside `scripts/` (with `.env` loaded manually by `loadLocalEnv()` in `scripts/sync-notion-images.mjs:16-28`).

## Git Commit Style

- Conventional-ish prefixes used in history: `feat:`, `chore:`, `change:`, plus bare messages (`scripts/sync-notion-images.mjs` history: `1c29b42 feat: add sync script...`, `5ac6163 change: remove obsolete folders`). Prefer `feat:`/`fix:`/`chore:` prefixes for new commits.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

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

- Content is authored in Notion, never in the repo; the repo holds rendering logic plus generated image assets.
- Every content/image fetch happens at build time; runtime serving is static HTML except `/api/update`.
- Third-party loader is adapted (not forked) through a wrapper that temporarily monkey-patches loader context hooks.
- Generated artifacts are staged then atomically renamed to keep builds idempotent and crash-safe.

## Layers

- Purpose: fetch Notion images ahead of Astro so the bundler can statically import them.
- Location: `scripts/sync-notion-images.mjs`
- Contains: Notion client queries, download/retry/cache logic, manifest + asset-module codegen.
- Depends on: `@notionhq/client`, `@netlify/blobs`, Node `fs`/`crypto`.
- Used by: `npm run dev` and `npm run build` (via `sync:notion-images` npm script); also `prune:notion-images`.
- Purpose: static import surface for images so Astro can hash/optimize them.
- Location: `src/assets/`
- Contains: `notion-generated/covers/*`, `notion-generated/body/**`, `notion-image-manifest.json`, `notion-image-assets.ts`, `notion-body-image-assets.ts`.
- Depends on: nothing (pure data/files).
- Used by: `src/utils/notion.ts` (manifest), `src/components/ImageWrapper.astro` (cover assets), `src/utils/astronotionloaderpatch.ts` + `src/utils/rehype-managed-notion-images.ts` (manifest, body paths).
- Purpose: pull typed, filtered Notion pages into Astro's content store.
- Location: `src/content.config.ts`, `src/utils/astronotionloaderpatch.ts`
- Contains: collection schema (Zod via `@astro-notion/loader/schemas`), loader wrapper, rehype plugin registration.
- Depends on: `astro:content`, `@astro-notion/loader`, `import.meta.env.NOTION_TOKEN`, `import.meta.env.NOTION_DATABASE_ID`.
- Used by: `src/utils/notion.ts` through `getCollection('blog')`.
- Purpose: present pages with a stable, typed post model instead of raw collection entries.
- Location: `src/utils/notion.ts`, `src/config.ts`
- Contains: `getNotionPosts()` (module-level memoized promise), `getNotionPostData()`, cover-image resolution keyed on `${pageId}:${last_edited_time}`.
- Depends on: `astro:content`, `@astro-notion/loader`, `src/assets/notion-image-manifest.json`.
- Used by: `src/pages/index.astro`, `src/pages/blog/[slug].astro`.
- Purpose: render HTML.
- Location: `src/pages/`, `src/layouts/`, `src/components/`
- Contains: two prerendered routes, one SSR API route, one layout, two components.
- Depends on: data-access layer + path aliases `@components/*`, `@layouts/*`, `@utils/*`.
- Used by: Astro router / Netlify.
- Purpose: trigger a Netlify rebuild on Notion changes.
- Location: `src/pages/api/update.ts`
- Contains: `POST`/`GET` handlers, secret check, build-hook fetch.
- Depends on: `import.meta.env.UPDATE_SECRET`, `import.meta.env.NETLIFY_HOOK_URL`.
- Used by: external caller (e.g. Notion automation/webhook).

## Data Flow

### Primary Request Path (build of a blog post)

### Content Update / Rebuild Flow

### Cover Image Selection at Render Time

- No client-side state; no JS hydration anywhere (no framework integrations installed).
- Build-time memoization: `let postsPromise` in `src/utils/notion.ts:21` caches posts for the process lifetime.
- Content store persistence: `.astro/data-store.json` (generated, gitignored) lets the loader skip unchanged pages via `digest`.
- Image cache: local `src/assets/notion-generated/` (primary) + Netlify Blobs store `notion-images` (secondary, optional, keeps 2 versions per identity with `--prune`).

## Key Abstractions

- Purpose: compatibility adapter over `@astro-notion/loader` that (a) exposes `last_edited_time` as data, (b) registers external body images so Astro rewrites their placeholders, (c) migrates older store records.
- Examples: `src/utils/astronotionloaderpatch.ts`, wired in `src/content.config.ts:7`
- Pattern: decorator/wrapper — spreads the original loader, overrides `createSchema` and `load`, temporarily monkey-patches `ctx.parseData`/`ctx.store.set` inside `load` and restores them in `finally`.
- Purpose: single source of truth mapping Notion page/block image revisions to local file names and Blob keys.
- Examples: `src/assets/notion-image-manifest.json`, typed inline in `src/utils/notion.ts:15` and `src/utils/astronotionloaderpatch.ts:6`
- Pattern: generated JSON manifest consumed by both runtime transform code and the sync script (which reads it back to skip re-downloads).
- Purpose: give Vite static-importable references so images become hashed build assets.
- Examples: `src/assets/notion-image-assets.ts`, `src/assets/notion-body-image-assets.ts`
- Pattern: generated barrel of `import imageN from './notion-generated/...'` keyed by absolute source path string.
- Purpose: the typed post shape pages consume.
- Examples: `src/config.ts:8-26`, produced by `src/utils/notion.ts:53`
- Pattern: view-model derived from collection entries (`Awaited<ReturnType<typeof getCollection<'blog'>>>[number]` for the raw item).
- Purpose: uniform transient-failure handling for all Notion/network calls in the sync script.
- Examples: `scripts/sync-notion-images.mjs:126`
- Pattern: 3 attempts, exponential backoff `400 * 2**attempt + jitter`.

## Entry Points

- Location: `package.json:5-14`
- Triggers: `npm run dev` (sync + astro dev), `npm run build` (sync + `astro sync` + `astro build`), `npm run sync:notion-images`, `npm run prune:notion-images` (Blob GC), `npm run preview`, `npm run clean`/`clear`.
- Responsibilities: the sync script is always the first step of dev/build — this ordering is an architectural requirement, not optional.
- Location: `src/pages/index.astro` (`prerender = true`), `src/pages/blog/[slug].astro` (`prerender = true`, `getStaticPaths`), `src/pages/api/update.ts` (`prerender = false`).
- Triggers: HTTP request at runtime / static file serving after build.
- Responsibilities: page composition (index) and post rendering (slug) are static; only `/api/update` executes server-side.
- Location: `src/content.config.ts`
- Triggers: `astro sync` and `astro build` (and `astro dev` startup).
- Responsibilities: registers the `blog` collection and its Notion-backed loader/schema.
- Location: `astro.config.js`
- Triggers: every Astro CLI invocation.
- Responsibilities: `output: 'server'`, `adapter: netlify()`, sharp image service with `limitInputPixels: false`, remote image domains `prod-files-secure.s3.us-west-2.amazonaws.com` and `www.notion.so` plus `**.amazonaws.com` patterns.
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

### Dead / divergent code paths

### Inline styles instead of the component stylesheet

### Stale comments/paths in docs and code

### Rebuild endpoint secrets via query string

## Error Handling

- Retry with exponential backoff + jitter, 3 attempts, for every Notion/network operation (`scripts/sync-notion-images.mjs:126-140`).
- Response validation before use — magic-byte image sniffing (`isImageBuffer`, line 105) rejects HTML error pages masquerading as images.
- Staging-then-rename with rollback: failed sync deletes staging, restores backup directory (`replaceDirectory` line 303, `catch` line 397).
- Per-image fallback: if a current image can't be prepared, the previous manifest version is copied and marked `stale: true` so it will be retried next run (`scripts/sync-notion-images.mjs:366-379`).
- Blob failures are warnings, never fatal (lines 267-282); missing Blobs credentials warn and continue without a persistent cache (line 122).
- Required env vars throw immediately with a named error (`requiredEnvironment`, line 30).
- Component-level guard: `ImageWrapper.astro:26-30` throws an instructive error telling the developer to run `sync:notion-images`.
- API route: 401 on bad secret, 500 on hook/network failure, JSON bodies (`src/pages/api/update.ts:10-27`); note the `catch` swallows the underlying error detail.

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
