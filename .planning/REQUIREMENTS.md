# Requirements

**Project:** Astro Notion Blog Pipeline
**Created:** 2026-10-15
**Scope:** v1 — pipeline stabilization (no new features)

## v1 Requirements

### Testing

- [ ] **TEST-01**: Vitest is configured as the test framework; `npm run test` runs unit and integration suites
- [ ] **TEST-02**: Unit tests cover pure transform functions: Notion property mapping (`src/utils/notion.ts`), URL parsing (`src/utils/url-utils.ts`), image manifest lookup
- [ ] **TEST-03**: Integration tests cover the content pipeline with a mocked Notion client: fetch → property transform → render-facing data shape (`PostsType`)
- [ ] **TEST-04**: Automated tests make no live Notion API calls and require no real secrets (fixtures/mocks only)

### Update Hook

- [ ] **HOOK-01**: `/api/update` rejects any request without valid authentication; the credential is NOT carried in the query string (Notion payload signature verification or header-based secret — mechanism decided during phase planning to match the actual Notion webhook setup). No manual action is ever required from the Notion author; the webhook configuration is updated once
- [ ] **HOOK-02**: `GET` no longer triggers an update (returns 405); only `POST` can trigger a rebuild
- [ ] **HOOK-03**: A successful request triggers the Netlify build hook; failure paths (bad auth, Netlify hook failure) return correct status codes — all covered by tests
- [ ] **HOOK-04**: End-to-end verification exists that a new Notion post flows to the live site: Notion webhook → `/api/update` → Netlify rebuild → post visible (documented checklist or script)

### Build Reliability

- [ ] **BUILD-01**: Image sync (`scripts/sync-notion-images.mjs`) failure modes are identified and made deterministic and observable — blob-cache unavailability must not break the build spuriously
- [ ] **BUILD-02**: Image downloads are manifest-driven and bounded; download behavior is deterministic and documented

### Architecture

- [ ] **ARCH-01**: SSR → prerender/hybrid migration is evaluated; a documented go/no-go decision with evidence is produced, verifying `/api/update` keeps working in either mode

### Documentation

- [ ] **DOC-01**: `SCHEMA-CHANGE.md` exists: step-by-step guide of which files change and how, when a new Notion property (e.g. `category`) is added to the database
- [ ] **DOC-02**: The guide is validated by actually walking the `category` property through the pipeline (e.g. in a test fixture), proving the documented steps are accurate

## v2 Requirements (deferred)

- [ ] **CI-01**: Test suite runs automatically on every push/PR (e.g. GitHub Actions) — deferred until local test suite is trusted
- [ ] **E2E-01**: Optional live smoke test against a real Notion dummy database (opt-in, secret-gated) — deferred due to flakiness/secrets trade-off
- [ ] **COV-01**: Coverage thresholds enforced — deferred until coverage baseline exists

## Out of Scope

- New user-facing features or frontend redesign — explicitly deferred until the pipeline is proven (user decision)
- Live Notion API calls in automated tests — flaky and requires secrets; mocks/fixtures instead (see TEST-04)
- Stack rewrite (Astro → Next.js etc.) — the prototype works; this project hardens it, not replaces it

## User Stories

- **As a site owner**, I want automated tests proving the Notion → Astro pipeline works, so I can develop frontend features without fearing silent data breakage
- **As a Notion author**, I want a new post to reliably appear on the site after I publish it, so content updates need no manual intervention
- **As a developer**, I want a documented, validated recipe for adding Notion database columns, so schema changes are mechanical instead of exploratory
- **As a site owner**, I want builds to be deterministic (no spurious failures from image sync), so deploys stay trustworthy

## Definition of Done

- `npm run test` passes locally with unit + integration suites, no network access required
- `/api/update` rejects unauthenticated requests; GET is side-effect-free; credential not in query string
- `SCHEMA-CHANGE.md` exists and its `category` walkthrough is proven by an automated test
- ARCH-01 decision document exists with evidence

## Traceability

<!-- Filled by roadmap: maps each REQ-ID to exactly one phase -->

| REQ-ID | Phase | Notes |
|--------|-------|-------|
| *(pending roadmap)* | | |
