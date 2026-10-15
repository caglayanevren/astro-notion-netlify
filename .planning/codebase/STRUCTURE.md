---
last_mapped_commit: 29a694fbbc547d803c7d51ed9eec950088f05efe
last_mapped_at: 2026-10-15
---
# Codebase Structure

**Analysis Date:** 2026-10-15

## Directory Layout

```
astro-notion-netlify/
├── astro.config.js          # Astro config: server output, Netlify adapter, image domains
├── package.json             # npm scripts (sync → dev/build), deps
├── tsconfig.json            # strict Astro config + @components/@layouts/@utils aliases
├── README.md                # Turkish-language usage + data lifecycle + file guide
├── opencode.jsonc           # OpenCode tool config (not app code)
├── .env                     # Local env (NOTION_TOKEN etc.) — never committed, never read by docs
├── scripts/
│   └── sync-notion-images.mjs  # Build-time Notion image sync + codegen (400 lines)
├── src/
│   ├── content.config.ts    # Astro Content Layer: `blog` collection, filter, schema
│   ├── config.ts            # Shared blog types + imageSavePath constant
│   ├── pages/               # Routes (file-based router)
│   │   ├── index.astro      # Home list, prerendered
│   │   ├── blog/[slug].astro# Post page, prerendered via getStaticPaths
│   │   └── api/update.ts    # SSR endpoint → Netlify build hook
│   ├── layouts/
│   │   └── Layout.astro     # HTML shell, lang="tr", meta, base styles
│   ├── components/
│   │   ├── ImageWrapper.astro # Cover image → Astro <Image> (WebP)
│   │   └── mainHeading.astro  # Static <h1> section
│   ├── utils/
│   │   ├── notion.ts                    # getNotionPosts() memoized post model
│   │   ├── astronotionloaderpatch.ts    # Wrapper over @astro-notion/loader
│   │   ├── rehype-managed-notion-images.ts # Rehype img src rewrite
│   │   └── url-utils.ts                 # BASE_URL joiner (currently unused)
│   ├── assets/               # GENERATED at build (gitignored except .gitkeep)
│   │   ├── notion-generated/
│   │   │   ├── .gitkeep
│   │   │   ├── covers/       # Cover images keyed by pageId-lastEditedTime
│   │   │   └── body/         # Body images (file/ + external/ subdirs)
│   │   ├── notion-image-manifest.json     # Generated manifest (v2)
│   │   ├── notion-image-assets.ts         # Generated cover asset map
│   │   └── notion-body-image-assets.ts    # Generated body asset map
│   └── types/
│       └── notion-image-manifest.d.ts     # Module declarations for generated files
├── public/                   # Static passthrough: favicon.ico, favicon.svg
├── dist/                     # Build output (gitignored)
├── .astro/                   # Astro generated types + content data-store (gitignored)
├── .netlify/                 # Netlify build artifacts: functions-serve, blobs-serve, db (gitignored)
├── graphify-out/             # Generated knowledge-graph artifacts (gitignored)
├── .planning/                # GSD planning docs (codebase/, phase dirs)
└── .vscode/                  # launch.json (astro dev), extensions.json
```

## Directory Purposes

**`src/pages/`:**
- Purpose: Astro file-based routing — the only place URL routes are defined.
- Contains: `.astro` page components (`index.astro`, `blog/[slug].astro`) and one `.ts` API route (`api/update.ts`).
- Key files: `src/pages/index.astro`, `src/pages/blog/[slug].astro`, `src/pages/api/update.ts`.

**`src/components/`:**
- Purpose: reusable presentational pieces used by pages.
- Contains: `.astro` components only (no framework components — no React/Vue/Svelte installed).
- Key files: `src/components/ImageWrapper.astro` (bridge from generated asset map to Astro `<Image>`), `src/components/mainHeading.astro`.

**`src/layouts/`:**
- Purpose: shared HTML document shell.
- Contains: `Layout.astro` — head/meta/favicon/title, `<slot />`, base `<style>`.
- Key files: `src/layouts/Layout.astro`.

**`src/utils/`:**
- Purpose: non-visual logic — content access, loader adaptation, HTML transform, URL helpers.
- Contains: TypeScript modules imported by pages and `src/content.config.ts`.
- Key files: `src/utils/notion.ts` (post model), `src/utils/astronotionloaderpatch.ts` (loader wrapper), `src/utils/rehype-managed-notion-images.ts` (rehype plugin).

**`src/assets/`:**
- Purpose: bundled image assets plus generated indexes over them.
- Contains: `notion-generated/**` (downloaded images), `notion-image-manifest.json`, `notion-image-assets.ts`, `notion-body-image-assets.ts`.
- Key files: all except `notion-generated/.gitkeep` are **generated** by `npm run sync:notion-images` and gitignored.

**`src/types/`:**
- Purpose: ambient module declarations for generated JSON/TS assets.
- Contains: `notion-image-manifest.d.ts` (declares `*notion-image-manifest.json`, `*notion-image-assets`, `*notion-body-image-assets`).

**`src/` root files:**
- Purpose: framework and domain configuration.
- Key files: `src/content.config.ts` (collection registration), `src/config.ts` (shared types).

**`scripts/`:**
- Purpose: standalone Node tooling run outside the Astro compiler.
- Contains: `sync-notion-images.mjs` — the entire Notion image pipeline (query → cache → download → codegen).

**`public/`:**
- Purpose: static files copied verbatim to site root.
- Contains: `favicon.ico`, `favicon.svg`.

## Key File Locations

**Entry Points:**
- `package.json:5-14`: npm scripts — `dev`/`build` always run `sync:notion-images` first.
- `src/content.config.ts`: content-layer entry; registers the `blog` collection.
- `src/pages/index.astro`, `src/pages/blog/[slug].astro`: prerendered routes.
- `src/pages/api/update.ts`: SSR route (`prerender = false`).

**Configuration:**
- `astro.config.js`: adapter (`@astrojs/netlify`), `output: 'server'`, sharp image service, allowed remote image domains.
- `tsconfig.json`: extends `astro/tsconfigs/strict`, defines `@components/*`, `@layouts/*`, `@utils/*`, `strictNullChecks`.
- `.gitignore`: marks `dist/`, `.astro/`, `.netlify/`, `.env`, `src/assets/notion-generated/*`, generated manifest/asset modules, `graphify-out`.
- `.vscode/launch.json`: "Development server" launch config running `astro dev`.
- No `netlify.toml` — build command and env config live in the Netlify UI.

**Core Logic:**
- `scripts/sync-notion-images.mjs`: image download/cache/codegen pipeline (retry, Blob cache, atomic swap, prune).
- `src/utils/astronotionloaderpatch.ts`: loader decorator adding `last_edited_time` + external body image registration + store migration.
- `src/utils/rehype-managed-notion-images.ts`: rewrites external Notion img srcs to `__ASTRO_IMAGE_` placeholders.
- `src/utils/notion.ts`: `getNotionPosts()` / `getNotionPostData()` — the typed data API pages consume.
- `src/config.ts`: `NotionPostItem`, `BlogPostDataType`, `PostsType`.

**Testing:**
- Not applicable — no test files, no test runner, no test config anywhere in the repo.

## Naming Conventions

**Files:**
- Astro components: PascalCase — `ImageWrapper.astro`, `Layout.astro`. (Exception: `mainHeading.astro` is camelCase; new components should prefer PascalCase.)
- Utility modules: kebab-case — `url-utils.ts`, `rehype-managed-notion-images.ts`. (Exception: `astronotionloaderpatch.ts` is lowercase-concatenated.)
- Framework-conventional names: `content.config.ts`, `astro.config.js`, `tsconfig.json`.
- Scripts: verb-first kebab-case — `sync-notion-images.mjs`, invoked as `sync:notion-images` / `prune:notion-images` npm scripts.

**Directories:**
- lowercase, kebab-case or single word: `src/pages`, `src/components`, `src/layouts`, `src/utils`, `src/assets/notion-generated`.
- Dynamic route segments use bracket params: `src/pages/blog/[slug].astro`.
- API routes mirror URL paths: `src/pages/api/update.ts` → `/api/update`.

**Code identifiers:**
- Functions/vars camelCase (`getNotionPosts`, `imagesByRevision`); types PascalCase (`PostsType`, `ManagedImage`); constants lowercase (`imageSavePath`, `storeName`) or SCREAMING_CASE for env keys (`NOTION_TOKEN`).
- Notion property names are PascalCase and must match the database exactly (`Name`, `Slug`, `Date`, `Status`, `Summary`, `Image`) — see `src/content.config.ts:21-26`.
- Comments/UI strings are Turkish in `README.md`, `src/pages/index.astro`, `src/pages/api/update.ts`; keep new user-facing strings consistent with that.

**Imports:**
- Path aliases for UI/logic layers: `@components/ImageWrapper.astro`, `@layouts/Layout.astro`, `@utils/notion`.
- Relative imports for shared root files and assets: `../config`, `../assets/notion-image-assets`, `../assets/notion-image-manifest.json` (no alias exists for these).
- Cross-directory imports inside `src/utils/` use `./` (e.g. `./rehype-managed-notion-images`).

## Where to Add New Code

**New blog page/route:**
- Page component: `src/pages/<route>.astro` (add `export const prerender = true` if it should be static — SSR is the default under `output: 'server'`).
- Reuse `src/layouts/Layout.astro` and fetch posts via `getNotionPosts()` from `@utils/notion`.

**New API/server endpoint:**
- Route handler: `src/pages/api/<name>.ts` exporting `APIRoute` `GET`/`POST`; set `export const prerender = false`; validate secrets against `import.meta.env.*` (pattern in `src/pages/api/update.ts`).

**New Notion database property:**
- Schema: add the Zod property in `src/content.config.ts` inside `notionPageSchema({ properties: ... })`.
- Type: extend `BlogPostDataType` in `src/config.ts`.
- Mapping: surface it in `getNotionPostData()` in `src/utils/notion.ts`.
- Display: consume it in `src/pages/index.astro` / `src/pages/blog/[slug].astro`.
- Update the property table in `README.md`.

**New reusable UI:**
- Component: `src/components/PascalCaseName.astro`; import via `@components/PascalCaseName.astro`.
- Page chrome/styles: extend `src/layouts/Layout.astro`.

**New shared logic/helper:**
- Implementation: `src/utils/<kebab-name>.ts`; import via `@utils/<kebab-name>` (alias) or `./<kebab-name>` from within `src/utils/`.
- Types shared across pages and content config: `src/config.ts`.

**New image handling behavior:**
- Download/caching/codegen changes: `scripts/sync-notion-images.mjs` (keep the staging + atomic rename protocol).
- Build-time HTML rewriting: `src/utils/rehype-managed-notion-images.ts`, registered in `src/utils/astronotionloaderpatch.ts:29-37`.
- Render-time cover lookup: `src/utils/notion.ts` + `src/components/ImageWrapper.astro`.
- Never hand-edit `src/assets/notion-image-manifest.json`, `notion-image-assets.ts`, `notion-body-image-assets.ts`, or anything under `src/assets/notion-generated/` — regenerate with `npm run sync:notion-images`.

**New dependency:**
- Runtime/build deps → `dependencies`; tooling → `devDependencies` (`package.json`). Only five runtime deps exist today: `astro`, `@astrojs/netlify`, `@notionhq/client`, `@netlify/blobs`; dev: `@astro-notion/loader`.

## Special Directories

**`src/assets/notion-generated/`:**
- Purpose: downloaded Notion cover + body images, served as build inputs.
- Generated: Yes (every `dev`/`build`).
- Committed: No — only `.gitkeep` is tracked (`.gitignore:31-33`).

**`dist/`:**
- Purpose: Astro build output deployed to Netlify.
- Generated: Yes.
- Committed: No (gitignored).

**`.astro/`:**
- Purpose: generated Astro types (`types.d.ts`, `content.d.ts`) and Content Layer state (`data-store.json`, `collections/`).
- Generated: Yes.
- Committed: No.

**`.netlify/`:**
- Purpose: Netlify adapter build output (`functions-serve/`, `blobs-serve/`, `build/`, `db/`).
- Generated: Yes.
- Committed: No.

**`graphify-out/`:**
- Purpose: code knowledge-graph artifacts (`graph.json`, `GRAPH_REPORT.md`, AST/semantic caches).
- Generated: Yes (by the graphify tooling).
- Committed: No (gitignored).

**`.planning/`:**
- Purpose: GSD planning workspace; `codebase/` holds the architecture/convention documents.
- Generated: No (authored).
- Committed: per GSD workflow conventions.

**`.env`:**
- Purpose: local environment configuration (Notion token, database id, update secret, Netlify hook).
- Generated: authored by developer.
- Committed: No (gitignored; contents never documented or quoted).

---

*Structure analysis: 2026-10-15*
