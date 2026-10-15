---
last_mapped_commit: 29a694fbbc547d803c7d51ed9eec950088f05efe
last_mapped_at: 2026-10-15
---
# Codebase Concerns

**Analysis Date:** 2026-10-15

## Tech Debt

**Monkey-patch of `@astro-notion/loader` internals:**
- Issue: `src/utils/astronotionloaderpatch.ts` reaches into loader internals with `as any` casts (`(loader as any).schema`, spread of `loaderWithoutSchema`), and re-wraps `ctx.parseData` and `ctx.store.set` to inject `last_edited_time` and repair `metadata.imagePaths`/`assetImports`. Two extra post-load migration passes (`src/utils/astronotionloaderpatch.ts:132` and `:151`) rewrite store entries that predate the fix.
- Files: `src/utils/astronotionloaderpatch.ts`, `src/content.config.ts`
- Impact: Any `@astro-notion/loader` upgrade within the `^1.1.2` range (`package.json`) can silently break digest semantics, `store.set` short-circuiting, or `metadata.imagePaths` handling. The migration passes run on every build even after one-time repair is done.
- Fix approach: Pin the loader exactly (no caret), guard the patch behind a capability check that fails the build with a clear message when internals change, and delete the migration passes once all deployed content stores have been regenerated.

**Leftover debug logging in production code:**
- Issue: Three `console.error('[DEBUG ...]')` calls log per-entry internals on every content load (`src/utils/astronotionloaderpatch.ts:89`, `:154`, `:163`).
- Files: `src/utils/astronotionloaderpatch.ts`
- Impact: Noisy Netlify build/dev logs on every sync; `console.error` also signals failure to log monitoring where none exists.
- Fix approach: Remove them or downgrade to a `DEBUG`-flag-gated `console.debug`.

**Stale and dead configuration:**
- Issue: `imageSavePath = "assets/notion"` in `src/config.ts:4` is unused (the live value `'assets/notion-generated/body'` is hardcoded in `src/utils/astronotionloaderpatch.ts:35`). `astro.config.js` carries commented-out Cloudflare adapter, `vite.ssr.external`, and `experimental.failOnPrerenderConflict` blocks (`astro.config.js:5-21`). `src/content.config.ts:2` and `src/pages/blog/[slug].astro:5,26-29` carry commented-out imports/JSX.
- Files: `src/config.ts`, `astro.config.js`, `src/content.config.ts`, `src/pages/blog/[slug].astro`
- Impact: Readers cannot tell which config is authoritative; the two divergent `imageSavePath` values invite editing the wrong one.
- Fix approach: Delete dead code; if the Cloudflare target is still a goal, track it as an issue instead of inline comments.

**README drift:**
- Issue: The file guide in `README.md:58` points to `src/components/misc/ImageWrapper.astro`, but the real path is `src/components/ImageWrapper.astro`. `README.md:62` claims only `.gitkeep` is tracked under `notion-generated/` (true) but does not mention that `src/assets/notion-image-assets.ts`, `src/assets/notion-body-image-assets.ts`, and `src/assets/notion-image-manifest.json` are also generated and gitignored.
- Files: `README.md`
- Impact: New contributors follow broken paths; onboarding friction.
- Fix approach: Correct paths; regenerate the file guide from the actual tree.

**Duplicated manifest type definitions:**
- Issue: The manifest shape is declared independently in `scripts/sync-notion-images.mjs` (implicit), `src/utils/astronotionloaderpatch.ts:6-12` (`ManagedImage`), `src/utils/notion.ts:6-19` (`NotionImageManifestEntry`), and `src/types/notion-image-manifest.d.ts:1-4` (typed as `unknown`, forcing casts at both import sites).
- Files: `src/utils/astronotionloaderpatch.ts`, `src/utils/notion.ts`, `src/types/notion-image-manifest.d.ts`
- Impact: A field rename in the sync script silently desynchronizes consumers; `unknown` typing defeats compile-time checking.
- Fix approach: Generate a `.d.ts` alongside the manifest from the sync script, or share one exported type used by both consumers.

**Two systems write into the same body-image directory:**
- Issue: The sync script downloads `file`-type body images into `src/assets/notion-generated/body/...` (`scripts/sync-notion-images.mjs:94`), while the patched loader is also configured with `imageSavePath: 'assets/notion-generated/body'` (`src/utils/astronotionloaderpatch.ts:35`) for the same `file`-type images. Only `external` body images are routed through the manifest/patch pipeline.
- Files: `scripts/sync-notion-images.mjs`, `src/utils/astronotionloaderpatch.ts`
- Impact: Unclear ownership of the directory; `replaceDirectory()` in the sync script (`scripts/sync-notion-images.mjs:303-317`) deletes files the loader may have written, and the loader may re-download images the script already cached.
- Fix approach: Make the script the single owner of `body/` for both `file` and `external` images, and strip `imageSavePath` from the loader options.

**Custom `.env` parser:**
- Issue: `loadLocalEnv()` in `scripts/sync-notion-images.mjs:16-28` parses `.env` with a regex; the capture `(.*)\s*$` is greedy so trailing whitespace is kept in values, and no `export ` prefix, interpolation, or escaping handling exists.
- Files: `scripts/sync-notion-images.mjs`
- Impact: Divergent behavior between local script runs and Vite/Netlify env loading; values with trailing spaces silently break tokens.
- Fix approach: Use `node --env-file=.env` (Node 20.6+) or a tiny dotenv dependency instead of a hand-rolled parser.

**Mixed-language comments and messages:**
- Issue: Comments and user-facing strings alternate between Turkish and English (`src/pages/api/update.ts:9-27`, `README.md`, `scripts/sync-notion-images.mjs:162`, `src/components/ImageWrapper.astro:6`) while error strings in `src/utils/astronotionloaderpatch.ts` are English.
- Files: multiple
- Impact: Inconsistent for contributors and for grep-based tooling.
- Fix approach: Pick one language for code comments/API messages (English recommended for OSS-tool compatibility) and note Turkish in docs only.

## Known Bugs

**GET endpoint triggers side effects:**
- Symptoms: `GET /api/update?secret=...` triggers a Netlify rebuild (`src/pages/api/update.ts:30-32` delegates to `POST`). Link prefetchers, crawlers, or health checks that encounter the URL can consume build minutes.
- Files: `src/pages/api/update.ts`
- Trigger: Any GET request with a valid secret.
- Workaround: Remove the `GET` export; README already documents `POST` (`README.md:20`).

**Empty-secret edge case:**
- Symptoms: If `UPDATE_SECRET` is deployed as an empty string, `?secret=` (empty query value) passes the `secret !== import.meta.env.UPDATE_SECRET` check because `'' !== ''` is false.
- Files: `src/pages/api/update.ts:10`
- Trigger: Misconfigured env var set to `""`.
- Workaround: Guard with `if (!import.meta.env.UPDATE_SECRET) return 500` before comparing.

**Unstable homepage ordering for posts without a Date:**
- Symptoms: The sort comparator in `src/pages/index.astro:13-19` returns `0` whenever either post lacks a `Date`, so undated posts appear in collection order, which can shift between builds.
- Files: `src/pages/index.astro`
- Trigger: Publish a post with an empty `Date` property.
- Workaround: Give every post a date; fix comparator to fall back to `last_edited_time` or name.

**Notion 429s handled with generic backoff:**
- Symptoms: The `retry()` helper (`scripts/sync-notion-images.mjs:126-140`) uses exponential backoff and ignores Notion's `Retry-After` hint; heavy pages (deeply nested blocks via `visitChildren` recursion) can exhaust the 3 attempts and fail the whole build.
- Files: `scripts/sync-notion-images.mjs`
- Trigger: Large database or rate-limit pressure during Netlify build.
- Workaround: Set `NOTION_DATA_SOURCE_ID` and keep the published set small; improve retry to honor `Retry-After`.

## Security Considerations

**Build-hook endpoint design (`/api/update`):**
- Risk: The secret travels in the query string (`?secret=...`) — query strings are written to CDN/server access logs, browser history, and potentially `Referer` headers. The endpoint has no rate limiting, so a leaked or guessed secret lets an attacker trigger unbounded Netlify builds (build-minute DoS / quota exhaustion). The secret comparison is not constant-time.
- Files: `src/pages/api/update.ts`, `README.md:20`
- Current mitigation: Shared-secret check; endpoint is server-only (`prerender = false`), so the secret is not exposed client-side by Astro's `PUBLIC_` convention.
- Recommendations: Accept the secret via an `Authorization` header or POST body, compare with `timingSafeEqual`, add per-IP throttling (Netlify-level or in-function), and consider validating a Notion webhook signature instead of a static secret.

**`.env` file present in the working tree:**
- Risk: `.env` exists at the repo root and is gitignored (`.gitignore:17`); it holds `NOTION_TOKEN`, `UPDATE_SECRET`, `NETLIFY_HOOK_URL`, and optionally `NETLIFY_AUTH_TOKEN` (per `README.md:24-32`). Existence noted only — contents not inspected.
- Files: `.env` (existence), `.gitignore`
- Current mitigation: `.env` and `.env.production` are gitignored.
- Recommendations: Keep secrets in Netlify env UI only; rotate `NOTION_TOKEN` if the repo is ever shared; consider `git-secrets`/gitleaks in CI.

**Signed Notion URLs persisted in the manifest:**
- Risk: `src/assets/notion-image-manifest.json` stores full Notion S3 URLs (expiring signed query tokens) for every image. The file is gitignored (`.gitignore:35`), but it lives inside `src/` and could be committed accidentally or included in build artifacts/debug dumps.
- Files: `src/assets/notion-image-manifest.json`, `scripts/sync-notion-images.mjs:51-54`
- Current mitigation: Gitignored; only origin+path (`sourceUrlKey`) is used for matching, but the raw `url` field is kept.
- Recommendations: Drop the `url` field from the persisted manifest (re-fetch from Notion when needed) or strip query parameters before writing.

**Notion content is a trusted HTML source:**
- Risk: Post bodies flow Notion → loader → `<Content />` in `src/pages/blog/[slug].astro:24` with no additional sanitization. Anyone with edit access to the Notion database can inject arbitrary markup into the published site.
- Files: `src/pages/blog/[slug].astro`, `src/utils/astronotionloaderpatch.ts`
- Current mitigation: Notion itself limits block types; content authors are implicitly trusted.
- Recommendations: Document the trust boundary; restrict Notion database edit access; if untrusted collaborators appear, add a rehype sanitize plugin.

**No auth/rate limiting surface beyond `/api/update`:** No other dynamic endpoints exist (`src/pages/` contains only `index.astro`, `blog/[slug].astro`, `api/update.ts`).

## Performance Bottlenecks

**Full SSR adapter for a fully prerenderable site:**
- Problem: `output: 'server'` with the Netlify adapter (`astro.config.js:9-10`) deploys a serverless function even though `index.astro:2` and `blog/[slug].astro:2` both set `prerender = true`; only `/api/update` is dynamic.
- Files: `astro.config.js`, `src/pages/index.astro`, `src/pages/blog/[slug].astro`
- Cause: Only the build-hook endpoint needs SSR.
- Improvement path: Use `output: 'static'` with `prerender = false` on the API route via Astro's hybrid/static API-route support, or move the hook trigger to a Netlify scheduled function so the whole site is static and CDN-cached.

**Unbounded image download and pixel processing:**
- Problem: `fetchImage()` (`scripts/sync-notion-images.mjs:142-150`) downloads whatever the URL returns with no content-length cap, and Astro's sharp service runs with `limitInputPixels: false` (`astro.config.js:26`).
- Files: `scripts/sync-notion-images.mjs`, `astro.config.js`
- Cause: Trusting remote asset sizes.
- Improvement path: Enforce a max byte size in `fetchImage`; reconsider `limitInputPixels: false` (it is only needed for very large panorama-style images).

**Blob cache silently disabled → full re-download on CI:**
- Problem: `createStore()` (`scripts/sync-notion-images.mjs:117-124`) returns `null` with only a `console.warn` when `NETLIFY_SITE_ID`/`NETLIFY_AUTH_TOKEN` (or build-context vars) are missing, so every clean CI build re-downloads all images from short-lived Notion URLs.
- Files: `scripts/sync-notion-images.mjs`
- Cause: Optional credential wiring.
- Improvement path: Fail fast in CI (when `NETLIFY` env is present) if Blob credentials are missing; surface the warning prominently.

**Blob versions accumulate without pruning:**
- Problem: `pruneOldBlobVersions()` only runs when the script is invoked with `--prune` (`scripts/sync-notion-images.mjs:330`), i.e., manually via `npm run prune:notion-images`.
- Files: `scripts/sync-notion-images.mjs:329-338`
- Cause: Deletion is opt-in.
- Improvement path: Prune automatically on successful sync (keep the flag to skip), or schedule the prune script.

**Build availability tied to Notion uptime:**
- Problem: `npm run build` runs the sync script first (`package.json:11`); any Notion API failure after retries throws and fails the entire deploy (`scripts/sync-notion-images.mjs:358-400`). Content fetching (`astro sync` → loader) has no offline fallback either.
- Files: `package.json`, `scripts/sync-notion-images.mjs`, `src/content.config.ts`
- Cause: No cached-content path.
- Improvement path: Image pipeline already has previous-copy fallbacks; extend resilience by committing the manifest and allowing `NOTION_OFFLINE=1` builds from the content-layer store.

**Per-request/per-build memoization may go stale in dev:**
- Problem: `getNotionPosts()` memoizes the posts promise at module scope (`src/utils/notion.ts:21,65-68`). In the long-lived `astro dev` process this can serve stale data until restart/HMR invalidation.
- Files: `src/utils/notion.ts`
- Cause: Module-level cache without dev-mode bypass.
- Improvement path: Gate the memo on `import.meta.env.DEV` or key it by build ID.

## Fragile Areas

**`src/utils/astronotionloaderpatch.ts` (most fragile file in the repo):**
- Files: `src/utils/astronotionloaderpatch.ts` (182 lines), with contracts shared with `src/utils/rehype-managed-notion-images.ts` and `scripts/sync-notion-images.mjs`
- Why fragile: Depends on at least five undocumented internals: (1) loader `schema()` being a function property, (2) `parseData` receiving `data` without `last_edited_time`, (3) `digest` semantics and `store.set` short-circuit on unchanged digest, (4) `rendered.metadata.imagePaths` / `assetImports` shape, (5) the `__ASTRO_IMAGE_` JSON placeholder protocol with Astro's content-image transform. Zero tests guard any of it.
- Safe modification: Change only with the exact pinned loader version installed, manually verifying a full `npm run build` plus a check that external body images resolve to local assets in `dist/`.
- Test coverage: None (no test framework exists in the repo at all).

**`scripts/sync-notion-images.mjs`:**
- Files: `scripts/sync-notion-images.mjs` (400 lines — the largest file in the repo)
- Why fragile: `bodyFileNameFromNotionUrl()` (`:80-95`) parses Notion file URL paths assuming exactly three segments (`parentId/objectId/fileName`); Notion has changed file-URL formats before. The whole script is untested and runs at the head of every build and dev start.
- Safe modification: Keep `isImageBuffer()` checks intact (they guard against HTML error pages being cached as images); test with both `file` and `external` image block types.
- Test coverage: None.

**`src/utils/rehype-managed-notion-images.ts`:**
- Files: `src/utils/rehype-managed-notion-images.ts`
- Why fragile: Emits `__ASTRO_IMAGE_` placeholders (`:50`) that only work because the patched loader adds matching entries to `metadata.imagePaths`; if Astro changes the placeholder format or the loader's rehype pipeline order changes, external images silently render as broken links rather than failing loudly.
- Safe modification: Verify rendered `<img>` src attributes after any Astro minor upgrade.
- Test coverage: None.

**Homepage sort logic:**
- Files: `src/pages/index.astro:13-19`
- Why fragile: Non-total comparator (returns `0` for missing dates) and double filtering (`Status === 'Published'` here *and* in the loader filter `src/content.config.ts:11-16`).
- Safe modification: Any change should keep the loader-level filter as the source of truth.
- Test coverage: None.

**Case-sensitive filename risk:**
- Files: `src/components/mainHeading.astro` (lowercase) imported as `MainHeading` in `src/pages/index.astro:5`
- Why fragile: Works on macOS's case-insensitive filesystem; a future rename/import mismatch breaks only on Linux CI/Netlify.
- Safe modification: Rename to `MainHeading.astro` (PascalCase, matching `ImageWrapper.astro`) in one commit updating both file and import.

## Scaling Limits

**Notion API pagination and rate limits:**
- Current capacity: Published pages are queried with default page size and recursive block traversal per page (`scripts/sync-notion-images.mjs:179-219`); concurrency is capped at 4 (`:13`).
- Limit: Hundreds of published pages with deep block trees will push against Notion's rate limit and Netlify's build timeout; a single 429 storm after 3 retries fails the build.
- Scaling path: Batch/queue traversal, honor `Retry-After`, and pre-warm Netlify Blobs so only changed pages hit Notion.

**Netlify build minutes:**
- Current capacity: Every Notion edit triggers a full rebuild via the build hook; image sync is incremental via manifest + Blobs.
- Limit: Public build-hook abuse (see Security) or frequent edits exhaust the free-tier minutes.
- Scaling path: Move to on-demand revalidation or cache the rendered pages; at minimum lock down `/api/update`.

## Dependencies at Risk

**`@astro-notion/loader` (pinned 1.1.2, declared `^1.1.2`):**
- Risk: Small third-party package whose private shape the patch file depends on; a `1.2.x` bump can break silently at runtime, not at typecheck (all accesses are `as any`).
- Impact: Content collection fails to load → build fails, or worse, images silently point at remote URLs again.
- Migration plan: Pin exactly (`"1.1.2"`), add a startup assertion in `astronotionloaderpatch.ts` for the expected internal shape, and evaluate upstreaming the `last_edited_time` fix.

**No `netlify.toml`:**
- Risk: Build command, publish directory, and Node version live only in the Netlify UI, so local reproduction and CI parity depend on tribal knowledge.
- Files: repo root (absent), `package.json` scripts
- Migration plan: Commit a `netlify.toml` mirroring the current UI settings.

**Tooling vacuum:**
- Risk: No ESLint, no Prettier, no `astro check` in the build script, no test runner, no CI workflows (no `.github/`, no `netlify.toml`). `tsconfig.json` extends `astro/tsconfigs/strict` but nothing enforces it outside the editor.
- Impact: Type errors and convention drift only surface at runtime or in review.
- Migration plan: Add `astro check` to `build` (or a `check` script wired into CI), add ESLint + Prettier, and a minimal Vitest setup covering `sync-notion-images.mjs` helpers (`isImageBuffer`, `extensionFromUrl`, `bodyFileNameFromNotionUrl`) and the rehype plugin.

## Missing Critical Features

**SEO/meta baseline:**
- Problem: `src/layouts/Layout.astro:9` hardcodes `<title>Astro Basics</title>`, has no meta description, no Open Graph tags, no canonical URL, no sitemap or RSS feed.
- Blocks: Discoverability; any content-sharing preview shows no metadata.

**404 page:**
- Problem: No `src/pages/404.astro`; unknown slugs hit the SSR/static default.
- Blocks: Graceful handling of renamed slugs — `README.md:65` explicitly warns that changing `Slug` breaks old URLs with no redirect mechanism.
- Fix: Add `404.astro` plus a `_redirects`/`netlify.toml` redirect policy for changed slugs.

**Automated tests:**
- Problem: Zero test files, no test framework in `package.json`.
- Blocks: Safe refactoring of the loader patch and sync script — the two most complex, most fragile components.

## Test Coverage Gaps

**Entire repository:**
- What's not tested: Everything — sync script helpers (`scripts/sync-notion-images.mjs`), the loader patch (`src/utils/astronotionloaderpatch.ts`), the rehype plugin (`src/utils/rehype-managed-notion-images.ts`), data mapping (`src/utils/notion.ts`), and the `/api/update` auth check (`src/pages/api/update.ts`).
- Files: all of `src/` and `scripts/`
- Risk: Image-pipeline regressions (broken cover resolution, remote URLs leaking into production HTML, manifest desync) ship undetected; the `console.error` debug statements currently in the patch suggest this pipeline has already needed runtime debugging without a safety net.
- Priority: High for `astronotionloaderpatch.ts` + `rehype-managed-notion-images.ts` (combined placeholder/manifest protocol) and `sync-notion-images.mjs` pure helpers; Medium for `/api/update.ts` auth logic; Low for `.astro` page templates.

---

*Concerns audit: 2026-10-15*
