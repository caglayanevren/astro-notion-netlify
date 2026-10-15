# Roadmap: Astro Notion Blog Pipeline

## Overview

This milestone stabilizes the existing Notion → Astro → Netlify pipeline without adding features. It starts by putting an automated, offline test safety net under the data pipeline (Vitest, mocked Notion client), then hardens and verifies the `/api/update` build hook so a Notion publish securely and reliably triggers a rebuild. Next it makes builds deterministic (image sync / blob-cache failure modes, bounded downloads) and settles the SSR → prerender/hybrid question with an evidence-based decision. It closes with a validated `SCHEMA-CHANGE.md` guide so adding Notion properties becomes mechanical. New user-facing features, CI, coverage thresholds, and a live smoke test are deferred to v2.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Test Safety Net** - Vitest suites prove the Notion → Astro pipeline works, locally and offline
- [ ] **Phase 2: Secure Update Hook** - A Notion publish securely and automatically triggers a rebuild
- [ ] **Phase 3: Build Reliability & Rendering Decision** - Builds are deterministic; SSR vs prerender is an evidence-based decision
- [ ] **Phase 4: Validated Schema-Change Guide** - Adding a Notion property is a documented, proven procedure

## Phase Details

### Phase 1: Test Safety Net
**Goal**: Automated tests prove the Notion → Astro data pipeline works, runnable locally with no network or secrets.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. `npm run test` runs both unit and integration suites locally and passes.
  2. Unit tests cover Notion property mapping (`src/utils/notion.ts`), URL parsing (`src/utils/url-utils.ts`), and image manifest lookup — breaking any of these transforms turns the suite red.
  3. An integration test drives fetch → property transform → render-facing `PostsType` with a mocked Notion client, proving the pipeline's data shape end-to-end.
  4. The whole suite passes with no network access and no real secrets — every Notion interaction is a mock/fixture (works without `.env`).
**Plans**: TBD

### Phase 2: Secure Update Hook
**Goal**: A Notion publish securely and automatically triggers a Netlify rebuild — no manual steps for the author, no secret in URLs.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: HOOK-01, HOOK-02, HOOK-03, HOOK-04
**Success Criteria** (what must be TRUE):
  1. Requests without valid authentication are rejected and the credential never appears in the query string; the Notion webhook is reconfigured once so the author never acts manually.
  2. `GET /api/update` returns 405 and triggers nothing — only `POST` can start a rebuild.
  3. A valid authenticated `POST` fires the Netlify build hook, and failure paths (bad auth, build-hook failure) return correct status codes — every path asserted by tests.
  4. A documented end-to-end checklist (or script) has been walked: new Notion post → webhook → `/api/update` → Netlify rebuild → post visible on the live site.
**Plans**: TBD

### Phase 3: Build Reliability & Rendering Decision
**Goal**: Builds are deterministic and observable, and the SSR → prerender/hybrid choice is an evidence-based, documented decision.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: BUILD-01, BUILD-02, ARCH-01
**Success Criteria** (what must be TRUE):
  1. Blob-cache unavailability (e.g. missing `NETLIFY_SITE_ID`/`NETLIFY_AUTH_TOKEN`) no longer breaks the build spuriously — the outcome is deterministic and clearly observable (documented fallback or clear, actionable failure).
  2. Image downloads are manifest-driven and size-bounded; download and caching behavior is documented so a developer can predict what a build will fetch.
  3. A go/no-go decision document exists with evidence (build/behavior comparison of SSR vs prerender/hybrid), and `/api/update` is verified to keep working under the chosen rendering mode.
**Plans**: TBD

### Phase 4: Validated Schema-Change Guide
**Goal**: Adding a Notion database property is a mechanical, proven procedure instead of exploratory debugging.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: DOC-01, DOC-02
**Success Criteria** (what must be TRUE):
  1. `SCHEMA-CHANGE.md` exists with step-by-step instructions on which files change and how when a Notion property (e.g. `category`) is added to the database.
  2. An automated test walks the `category` property through the pipeline via a test fixture, proving the documented steps are accurate.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Test Safety Net | 0/TBD | Not started | - |
| 2. Secure Update Hook | 0/TBD | Not started | - |
| 3. Build Reliability & Rendering Decision | 0/TBD | Not started | - |
| 4. Validated Schema-Change Guide | 0/TBD | Not started | - |

## Deferred (v2, intentionally unmapped)

- **CI-01**: Test suite on every push/PR
- **E2E-01**: Opt-in live smoke test against a real Notion dummy database
- **COV-01**: Coverage thresholds
