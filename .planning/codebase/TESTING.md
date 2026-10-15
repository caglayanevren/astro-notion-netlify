---
last_mapped_commit: 29a694fbbc547d803c7d51ed9eec950088f05efe
last_mapped_at: 2026-10-15
---
# Testing Patterns

**Analysis Date:** 2026-10-15

## Test Framework

**Runner:**
- **Not detected** — no test framework is installed or configured. `package.json` has no `test` script, and there are no `jest.config.*`, `vitest.config.*`, `playwright.config.*`, or `cypress.config.*` files. No test libraries appear in `package-lock.json` (zero `vitest` matches).
- No ESLint/Prettier config either; type checking via `astro/tsconfigs/strict` is the only automated static check.

**Assertion Library:**
- None present.

**Run Commands:**

```bash
npm run build              # De facto verification: type-checks + renders all pages
npm run dev                # Dev server (runs sync:notion-images first)
npm run preview            # Preview built output
npx astro check            # Type checking (if @astrojs/check added)
```

**If a test runner is added**, use **Vitest** — it is the ecosystem default for Astro/Vite projects, handles `import.meta.env`, and can unit-test plain `.ts` modules directly. Install `vitest` as a devDependency and add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

to `package.json` `scripts`.

## Test File Organization

**Location:**
- No tests exist anywhere in the repo (no `*.test.*` or `*.spec.*` files).
- Recommended convention if introduced: **co-located tests** next to sources (e.g. `src/utils/rehype-managed-notion-images.test.ts`), or a top-level `test/` directory mirroring `src/`. Given the repo's flat structure, co-located is the lighter-weight fit.

**Naming:**
- Not established. Recommended: `<module>.test.ts` co-located, or `*.spec.ts` — pick one and apply it everywhere.

**Structure:**

```
src/utils/                    # production code
  url-utils.ts
  url-utils.test.ts           # recommended location (does not exist yet)
scripts/
  sync-notion-images.mjs      # testable pure helpers live here
```

## Test Structure

**Suite Organization:**
- No suites exist. The idiomatic Vitest shape for this codebase would be:

```typescript
import { describe, it, expect } from 'vitest';
// import { rehypeManagedNotionImages } from './rehype-managed-notion-images';

describe('rehypeManagedNotionImages', () => {
  it('replaces matching external image src with asset placeholder', () => {
    // ...
  });
});
```

**Patterns:**
- Setup/teardown: not established.
- Assertion pattern: not established.

## Mocking

**Framework:** None.

**Patterns:**
- No mocking exists. If tests are added, these seams are the natural mock points:
  - `@notionhq/client` `Client` (`scripts/sync-notion-images.mjs:341`) — network boundary.
  - `fetch` (image downloads at `scripts/sync-notion-images.mjs:144`, Netlify hook call in `src/pages/api/update.ts:16`).
  - `@netlify/blobs` `getStore` (`scripts/sync-notion-images.mjs:117-124`) — already returns `null` when unconfigured, so no mock needed for the "no cache" path.
  - `node:fs/promises` for manifest/asset file IO — or point the script at a temp directory (paths derive from `process.cwd()` at `scripts/sync-notion-images.mjs:7-11`).
  - `import.meta.env` vars (`NOTION_TOKEN`, `UPDATE_SECRET`, `NETLIFY_HOOK_URL`) — set via Vitest `env`/`setup` rather than mocking.

**What NOT to Mock:**
- Pure helpers in `scripts/sync-notion-images.mjs` are self-contained and should be tested directly: `safeFileSegment`, `extensionFromUrl`, `isImageBuffer`, `imageKey`, `blobKey`, `fileNameFor`, `normalizeSourceUrl`, `mapWithConcurrency`, `renderAssetModule`.
- `src/utils/rehype-managed-notion-images.ts` `normalizeSourceUrl` and the tree visitor operate on plain objects — test with literal hast-like node objects instead of mocking.
- `joinUrl`/`url` in `src/utils/url-utils.ts`.

## Fixtures and Factories

**Test Data:**
- None exist. The closest things to fixtures are build artifacts that tests should NOT depend on:
  - `src/assets/notion-image-manifest.json` (generated, gitignored) — if needed as a fixture, create a minimal inline object matching the `NotionImageManifest` shape declared in `src/utils/notion.ts:15-19` (`{ version, generatedAt, images: [...] }`).
  - `src/types/notion-image-manifest.d.ts` declares module types for the generated JSON/asset modules — a fixture JSON must satisfy `NotionImageManifest`, and asset-module fixtures must be `Record<string, ImageMetadata>`.

**Location:**
- Not established. Recommended: `test/fixtures/` for shared JSON, inline literals for one-off cases (hast nodes, Notion block objects).

## Coverage

**Requirements:** None enforced. No coverage tool configured.

**View Coverage:**

```bash
npx vitest --coverage   # after adding vitest + @vitest/coverage-v8
```

## Test Types

**Unit Tests:**
- Not present. Highest-value targets if introduced, in priority order:
  1. `scripts/sync-notion-images.mjs` pure helpers (filename derivation, image magic-byte detection, key builders, concurrency mapper) — most logic, zero risk of needing network if IO is seam-isolated.
  2. `src/utils/rehype-managed-notion-images.ts` — deterministic tree transform, easily tested with literal node objects.
  3. `src/utils/url-utils.ts` — trivial but cheap to lock down (note: `joinUrl` collapses duplicate slashes, which matters for `BASE_URL` edge cases).
  4. `src/pages/api/update.ts` — route handler is a plain `(context) => Response` function; test 401 on bad secret and 500 on hook failure by stubbing `fetch`.

**Integration Tests:**
- Not present. The build (`npm run build`) is currently the only end-to-end check: it runs `sync:notion-images`, `astro sync`, `astro build`, and fails loudly when a prepared image asset is missing (`src/components/ImageWrapper.astro:27-30`) or env vars are absent (`scripts/sync-notion-images.mjs:32`). Treat `npm run build` as the mandatory gate.

**E2E Tests:**
- Not used. No Playwright/Cypress.

## Common Patterns

**Async Testing:**
- No established pattern. Note that `src/utils/notion.ts` memoizes `postsPromise` at module scope (`:21`, `:66`) — tests touching `getNotionPosts()` share that cache; reset with `vi.resetModules()` if isolation is needed.

**Error Testing:**
- No established pattern. Error paths worth asserting: `ImageWrapper` missing-asset throw, `requiredEnvironment` throw, `retry()` rethrow after 3 attempts (last error preserved at `scripts/sync-notion-images.mjs:139`), `api/update.ts` 401/500 responses.

## Current Verification Workflow (what exists instead of tests)

1. `npm run build` — must pass; it exercises env validation, Notion sync, content loading, image manifest resolution, and full page rendering.
2. Manual review in `npm run dev` / `npm run preview`.
3. Netlify deploy status badge (README line 1) as the production smoke signal.
4. No CI pipeline (`.github/workflows` absent) — builds run only on Netlify deploy.

---

*Testing analysis: 2026-10-15*
