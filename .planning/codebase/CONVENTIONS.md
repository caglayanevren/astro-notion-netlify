---
last_mapped_commit: 29a694fbbc547d803c7d51ed9eec950088f05efe
last_mapped_at: 2026-10-15
---
# Coding Conventions

**Analysis Date:** 2026-10-15

## Naming Patterns

**Files:**
- Components (`.astro`): inconsistent casing — both PascalCase and camelCase exist:
  - `src/components/ImageWrapper.astro` (PascalCase)
  - `src/components/mainHeading.astro` (camelCase)
  - Prefer **PascalCase** for new components to match the majority of Astro ecosystem convention (`ImageWrapper`, `Layout`).
- Utilities (`.ts`): mixed styles — `src/utils/notion.ts`, `src/utils/url-utils.ts` (kebab-case), `src/utils/astronotionloaderpatch.ts` (lowercase, no separators), `src/utils/rehype-managed-notion-images.ts` (kebab-case). Prefer **kebab-case** for new utils (`url-utils.ts`, `rehype-managed-notion-images.ts` are the strongest examples).
- Routes: Astro convention — `src/pages/blog/[slug].astro` for dynamic params, plain names for static (`src/pages/index.astro`), API routes as `.ts` with HTTP-method exports (`src/pages/api/update.ts`).
- Scripts: kebab-case `.mjs` — `scripts/sync-notion-images.mjs`.
- Generated files: `src/assets/notion-image-manifest.json`, `src/assets/notion-image-assets.ts`, `src/assets/notion-body-image-assets.ts` — always prefixed `notion-`, never hand-edited (see `.gitignore` and README "Koda katkı için dosya rehberi").

**Functions:**
- camelCase: `getNotionPosts`, `loadNotionPosts`, `getNotionPostData`, `syncImage`, `imageKey`, `blobKey`, `safeFileSegment`, `mapWithConcurrency`.
- Data-shaping helpers use verb-first naming: `loadPreviousManifest`, `renderAssetModule`, `normalizeSourceUrl`.
- Route handlers are named after HTTP verbs: `export const POST: APIRoute`, `export const GET: APIRoute` (`src/pages/api/update.ts`).

**Variables:**
- camelCase for locals and module-level state: `imagesByRevision`, `postsPromise`, `externalBodyImages`, `stagingDirectory`.
- SCREAMING_SNAKE_CASE for env-derived constants is not used; env vars are read inline (`import.meta.env.NOTION_TOKEN`, `process.env.NETLIFY_AUTH_TOKEN`).
- Notion property names are preserved verbatim (PascalCase) as data keys: `Name`, `Slug`, `Date`, `Status`, `Summary`, `Image` (`src/config.ts`, `src/content.config.ts`).

**Types:**
- PascalCase, often suffixed with `Type`, `DataType`, or `Item`: `BlogPostDataType`, `PostsType`, `NotionPostItem`, `NotionImageManifestEntry`, `ManagedImage`, `ManagedBodyImage` (`src/config.ts`, `src/utils/notion.ts`, `src/utils/astronotionloaderpatch.ts`).
- Astro component props use `interface Props` with JSDoc-style inline comments (`src/components/ImageWrapper.astro:5`).
- Derived types from loaders: `type NotionPostItem = Awaited<ReturnType<typeof getCollection<'blog'>>>[number]` (`src/config.ts:6`).
- Zod schemas compose `notionPageSchema({ properties: z.object({...}) }).extend({...})` (`src/content.config.ts`).

## Code Style

**Formatting:**
- **No formatter configured** (no `.prettierrc`, `biome.json`, or `.editorconfig` in repo root). Existing indentation is mixed:
  - `.astro` pages/layouts: tabs (`src/pages/index.astro`, `src/layouts/Layout.astro`)
  - `.ts` sources: 4 spaces (`src/utils/*.ts`, `src/config.ts`, `src/content.config.ts`)
  - `scripts/sync-notion-images.mjs`: 2 spaces
- Match the file you are editing; when creating new files, use **4 spaces for `.ts`** and **tabs for `.astro` frontmatter/markup** to match nearest neighbors.
- Single quotes preferred in TS (`import type { APIRoute } from 'astro'`), but double quotes appear in `.astro` imports (`import Layout from "@layouts/Layout.astro"`) and in `src/config.ts` (`"assets/notion"`). Both occur; single quotes are the majority in `.ts`.
- Trailing commas used in multiline calls/lists (`src/utils/notion.ts`, `astro.config.js`).

**Linting:**
- **No ESLint/Prettier/Biome config or dependency exists** (only a transitive eslint string in `package-lock.json`). No lint script in `package.json`.
- Type safety comes from `astro/tsconfigs/strict` + `strictNullChecks: true` in `tsconfig.json`; `allowJs: true` covers `.astro`/`.js`.
- `astro.config.js` starts with `// @ts-check` — keep that pattern for new root config JS.
- Avoid `as any` — it currently exists only in `src/utils/astronotionloaderpatch.ts` (`:38`, `:44`, `:61`, `:76`) as a workaround for untyped loader internals; do not spread it to other files.

## Import Organization

**Order:**
1. Node builtins (`node:crypto`, `node:fs/promises`, `node:path` — always with `node:` prefix, see `scripts/sync-notion-images.mjs:1-3`)
2. External packages (`astro`, `astro:content`, `@astro-notion/loader`, `@notionhq/client`, `@netlify/blobs`)
3. Path-alias local imports (`@components/*`, `@layouts/*`, `@utils/*`)
4. Relative local imports (`../config`, `../assets/notion-image-manifest.json`, `./rehype-managed-notion-images`)

Example (canonical): `src/utils/astronotionloaderpatch.ts:1-4`.

**Path Aliases:**
- Defined in `tsconfig.json` `compilerOptions.paths`:
  - `@components/*` → `./src/components/*`
  - `@layouts/*` → `./src/layouts/*`
  - `@utils/*` → `./src/utils/*`
- **No alias exists for `src/config.ts` or `src/assets/`** — those are imported relatively (`src/pages/index.astro:8` uses `'../config'`; `src/utils/notion.ts:3` uses `'../assets/notion-image-manifest.json'`). Keep using relative imports for those, or add an alias in `tsconfig.json` if introducing one.
- Type-only imports use inline `type` modifier: `import { type PostsType, type BlogPostDataType } from '../config'` (`src/utils/notion.ts:4`) or `import type { Loader } from 'astro/loaders'`.

## Error Handling

**Patterns:**
- **Fail fast with descriptive `Error` for unrecoverable conditions** (build-time):
  ```typescript
  // src/components/ImageWrapper.astro:27
  throw new Error(
    `ImageWrapper: the prepared asset "${filename}" is missing. Run sync:notion-images before building.`
  );
  ```
  ```javascript
  // scripts/sync-notion-images.mjs:32
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  ```
- **ENOENT-as-fallback**: file-not-found is handled silently (returns `false`/default) while other errors rethrow — `loadLocalEnv` (`scripts/sync-notion-images.mjs:25-27`), `loadPreviousManifest` (`:155-157`), `copyIfPresent` (`:244-247`), `replaceDirectory` (`:307-309`).
- **Retry with exponential backoff + jitter** for all network calls via `retry(operation, label)` — 3 attempts, `400 * 2**attempt + random(0..200)` ms delay (`scripts/sync-notion-images.mjs:126-140`). Wrap Notion API and image downloads in it.
- **Degrade gracefully with `console.warn`** for optional infrastructure: missing Netlify Blobs credentials (`:122`), failed blob read/write (`:270`, `:280`), invalid cached blob (`:266`), stale-image fallback (`:371`).
- **HTTP endpoint**: manual `Response` construction with status codes and JSON `{ message }` payloads; catch-all returns 500 without logging the error (`src/pages/api/update.ts:14-27`). Secret check is a plain `!==` comparison against `import.meta.env.UPDATE_SECRET` returning 401.
- **Cleanup in `finally` / staged writes**: loader patch restores monkey-patched functions in `try/finally` (`src/utils/astronotionloaderpatch.ts:121-126`); sync script writes to `*.staging-<uuid>` paths and swaps atomically, removing the staging dir in `catch` (`scripts/sync-notion-images.mjs:353-399`).

## Logging

**Framework:** `console` only (no logging library).

**Patterns:**
- `console.log` for the one final success summary (`scripts/sync-notion-images.mjs:396`).
- `console.warn` for recoverable/fallback situations in scripts — always includes the failing key/id and the fallback action (`scripts/sync-notion-images.mjs:135`, `:270`, `:280`, `:371`).
- `console.error` with `[DEBUG ...]` prefixes in `src/utils/astronotionloaderpatch.ts:89`, `:154`, `:163` — these are diagnostic traces for loader/store state; if adding new ones, keep the `[DEBUG <phase>] id=<entryId> ...` shape, and treat removal of these as cleanup, not as a pattern to copy into new features.
- Human-facing API messages are written in Turkish (`src/pages/api/update.ts:11`, `:21`), matching the Turkish UI (`<html lang="tr">`, README).

## Comments

**When to Comment:**
- Comments explain **why a workaround exists**, not what the code does — especially around upstream-loader quirks. See the multi-line rationale blocks in `src/utils/astronotionloaderpatch.ts:57-60`, `:71-74`, `:94-99`, `:129-131`, `:147-150`.
- Brief inline notes mark build-generated or optional fields: `// Converts to a primitive string` (`src/content.config.ts:21`), `// Şifre kontrolü` (`src/pages/api/update.ts:9`).
- Language is mixed Turkish/English: UI and API comments in Turkish (`src/pages/index.astro:11`, `src/pages/blog/[slug].astro:17`), technical/loader comments in English. Match the language of the surrounding file.
- No TODO/FIXME/HACK markers exist anywhere in `src/` or `scripts/`.

**JSDoc/TSDoc:**
- One TSDoc-style block comment exists for the rehype plugin (`src/utils/rehype-managed-notion-images.ts:24-27`) — use this form for exported transforms/plugins.
- Component props documented as short trailing comments on each field (`src/components/ImageWrapper.astro:5-12`).
- No `@param`/`@returns` tags anywhere; do not introduce heavy JSDoc.

## Function Design

**Size:** Small, single-purpose. The sync script decomposes into ~25 helpers under 30 lines each (`imageKey`, `blobKey`, `fileNameFor`, `isImageBuffer`, `mapWithConcurrency` in `scripts/sync-notion-images.mjs`). Long orchestration lives in top-level `await` statements (`:340-399`), not in a giant function.

**Parameters:**
- Prefer an options object for functions with 3+ inputs: `syncImage({ image, store, previousByKey, stagingDirectory })` (`scripts/sync-notion-images.mjs:250`).
- Pure helpers take primitives and return strings/booleans (`safeFileSegment(value)`, `extensionFromUrl(url)`).
- Rehype plugins are factory functions returning the transformer: `rehypeManagedNotionImages(images)` → `(tree) => {...}` (`src/utils/rehype-managed-notion-images.ts:28-53`).

**Return Values:**
- Async functions return `Promise<T>` with explicit type annotations in TS (`src/utils/notion.ts:35`, `:53`).
- Failures throw; optional data returns `undefined`/`null` (`getImageAssetPath` returns `string | undefined`, `createStore` returns `null`).
- Mutation-free data shaping: new objects are built with spreads (`src/utils/astronotionloaderpatch.ts:78-85`).

## Module Design

**Exports:**
- Named exports everywhere; **no default exports** in `.ts` files (only Astro components export implicitly).
- Barrel/index files: **not used** — import directly from the specific module.
- Public surface of `src/utils/notion.ts` is just `getNotionPostData` + `getNotionPosts`; `loadNotionPosts` stays private (module-level memoization via `postsPromise ??= ...` at `:21`, `:66`). Follow this: cache build-wide async data at module scope and expose a single getter.
- Env access convention: `import.meta.env.*` inside `src/`, `process.env.*` inside `scripts/` (with `.env` loaded manually by `loadLocalEnv()` in `scripts/sync-notion-images.mjs:16-28`).

## Git Commit Style

- Conventional-ish prefixes used in history: `feat:`, `chore:`, `change:`, plus bare messages (`scripts/sync-notion-images.mjs` history: `1c29b42 feat: add sync script...`, `5ac6163 change: remove obsolete folders`). Prefer `feat:`/`fix:`/`chore:` prefixes for new commits.

---

*Convention analysis: 2026-10-15*
