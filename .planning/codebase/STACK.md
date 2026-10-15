---
last_mapped_commit: 29a694fbbc547d803c7d51ed9eec950088f05efe
last_mapped_at: 2026-10-15
---
# Technology Stack

**Analysis Date:** 2026-10-15

## Languages

**Primary:**
- TypeScript (strict) - Application code: `src/**/*.ts`, `src/**/*.astro` frontmatter, enabled via `astro/tsconfigs/strict` + `strictNullChecks: true` (`tsconfig.json`)
- Astro Component syntax (`.astro`) - Pages and components: `src/pages/index.astro`, `src/pages/blog/[slug].astro`, `src/layouts/Layout.astro`, `src/components/ImageWrapper.astro`, `src/components/mainHeading.astro`

**Secondary:**
- JavaScript (ESM, `"type": "module"`) - Build tooling script `scripts/sync-notion-images.mjs`, config `astro.config.js`
- Markdown/HTML - Blog bodies come pre-rendered as HTML from Notion via the content loader (no local `.md` content files)

## Runtime

**Environment:**
- Node.js v24.21.0 (local development; no `engines` field in `package.json` and no `.nvmrc`/`.node-version` in repo)
- Deployment runtime: Netlify Functions (SSR) for `src/pages/api/update.ts`; static prerender for pages
- No runtime version pinned in repo — Netlify build image settings live in the Netlify UI (there is no `netlify.toml`)

**Package Manager:**
- npm 12.2.0
- Lockfile: present (`package-lock.json`, lockfileVersion 3)

## Frameworks

**Core:**
- Astro `7.3.8` (declared `^7.3.8`) - Static site generator with Content Layer; `output: 'server'` in `astro.config.js` with per-page `export const prerender = true`
- `@astrojs/netlify` `8.2.9` (declared `^8.2.9`) - Netlify adapter (`astro.config.js:10`)
- `@astro-notion/loader` `1.1.2` (devDependency) - Notion content-layer loader, wrapped by `src/utils/astronotionloaderpatch.ts`

**Testing:**
- Not detected - no test framework, no test files, no `test` script in `package.json`

**Build/Dev:**
- npm scripts (`package.json`):
  - `dev`: `npm run sync:notion-images && astro dev`
  - `build`: `npm run sync:notion-images && astro sync && astro build`
  - `preview`: `astro preview`
  - `sync:notion-images` / `prune:notion-images`: `node scripts/sync-notion-images.mjs [--prune]`
  - `clean` / `clear`: remove `dist`, `.astro`, `.netlify`, `node_modules`
- Sharp image service - explicit entrypoint `astro/assets/services/sharp` with `limitInputPixels: false` (`astro.config.js:22-36`)

## Key Dependencies

**Critical:**
- `@notionhq/client` `5.27.0` - Official Notion API client; used by `scripts/sync-notion-images.mjs`. Note: `@astro-notion/loader` bundles its own nested `@notionhq/client` `2.3.0` (`node_modules/@astro-notion/loader/node_modules/@notionhq/client`), so two major SDK versions coexist
- `@astro-notion/loader` `1.1.2` - Loads the `blog` collection from Notion in `src/content.config.ts`; pulls in `unified` `11.0.5`, `notion-rehype-k`, `rehype-katex`, `rehype-slug`, `@jsdevtools/rehype-toc`, `slug`, `fs-extra`, `kleur`
- `@netlify/blobs` `11.1.4` - Persistent image cache store `notion-images` in `scripts/sync-notion-images.mjs`
- `astro` `7.3.8` - Framework; also provides `astro:content`, `astro:assets`

**Infrastructure:**
- `sharp` `0.35.5` - Image optimization (WebP output at `quality: 80`, widths `[400, 800, 1200]` in `src/components/ImageWrapper.astro`)
- `zod` `4.6.6` - Collection schema validation (via `astro:content` `z` in `src/content.config.ts`)
- `esbuild` `0.28.1` - Build pipeline (transitive via Astro)

## Configuration

**Environment:**
- `.env` file at project root (present, git-ignored) — local secrets; contents never committed. `scripts/sync-notion-images.mjs:16-28` parses `.env` manually for build-time scripts; Astro exposes the same vars to app code via `import.meta.env`
- Required vars: `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `UPDATE_SECRET`, `NETLIFY_HOOK_URL`
- Optional vars: `NETLIFY_SITE_ID`/`SITE_ID`, `NETLIFY_AUTH_TOKEN`/`NETLIFY_API_TOKEN`, `NOTION_DATA_SOURCE_ID`, `NETLIFY_BLOBS_CONTEXT`
- Runtime usage: `src/content.config.ts:8-9` (`NOTION_TOKEN`, `NOTION_DATABASE_ID`), `src/pages/api/update.ts:10,16` (`UPDATE_SECRET`, `NETLIFY_HOOK_URL`), `src/utils/url-utils.ts:7` (`BASE_URL`, Astro built-in)

**Build:**
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

**Development:**
- Node 24.x + npm 12 (observed), `npm install`, then `npm run dev` (runs Notion image sync first — requires `.env` with `NOTION_TOKEN`/`NOTION_DATABASE_ID`)

**Production:**
- Netlify (site project `lovely-hamster-bf53e1` per README deploy badge)
- Build command follows the `build` npm script (image sync → `astro sync` → `astro build`); adapter emits Netlify Functions + Edge/CDN static assets
- GitHub remote: `https://github.com/caglayanevren/astro-notion-netlify.git` (active branch `codex-main`)

---

*Stack analysis: 2026-10-15*
