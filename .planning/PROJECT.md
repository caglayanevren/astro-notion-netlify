# Astro Notion Blog Pipeline

## What This Is

A personal blog/content site that pulls content from a Notion database (currently dummy data), keeps itself fresh via a Notion webhook, and renders pages with Astro on Netlify. It started as an experiment to validate the Notion → web data flow; before building out the frontend, the pipeline must be proven reliable and error-free.

## Core Value

The Notion → website data flow (fetch, update via webhook, render in Astro) must work correctly and be verifiably so — everything else waits on this.

## Requirements

### Validated

<!-- Shipped and confirmed valuable — inferred from existing code (brownfield). -->

- ✓ Notion content is fetched into Astro content collections via `@astro-notion/loader` — existing
- ✓ Notion images are synced locally at build time with a manifest/blob cache (`scripts/sync-notion-images.mjs`) — existing
- ✓ Blog posts render in Astro from Notion data (SSR via `@astrojs/netlify`) — existing
- ✓ `POST /api/update` triggers a Netlify rebuild via build hook (`NETLIFY_HOOK_URL`) — existing
- ✓ A Notion webhook is configured to call `/api/update` — existing (per user)

### Active

<!-- Current scope — stabilization, no new features. -->

- [ ] Test infrastructure (Vitest) in place with `npm run test`, unit + integration layers
- [ ] Data pipeline correctness covered by tests: Notion fetch → property transform → render-facing data (mocked Notion client, no live API calls)
- [ ] `/api/update` hardened and covered by tests: secret moved out of query string, GET side-effect removed, responses/status codes verified
- [ ] Update hook verified end-to-end: Notion webhook → `/api/update` → Netlify build hook → rebuild picks up new post
- [ ] Build reliability improved: image sync / `@netlify/blobs` build-availability risks addressed (see `.planning/codebase/CONCERNS.md`)
- [ ] SSR → prerender/hybrid migration evaluated; go/no-go decision documented with rationale
- [ ] `SCHEMA-CHANGE.md` guide written: step-by-step what changes in which files when a Notion property (e.g. `category`) is added

### Out of Scope

- New user-facing features or frontend redesign — explicitly deferred until the pipeline is proven (user decision)
- Live Notion API calls in automated tests — would be flaky and require secrets; tests use mocks/fixtures instead
- Rewriting the stack (Astro → Next.js etc.) — the prototype works; this project hardens it, not replaces it

## Context

- Prototype built by the user as a trial: dummy Notion data fetched, updated, and rendered — the system works end-to-end today
- No test framework, linter, formatter, or CI exists; `npm run build` is the de-facto verification
- `.planning/codebase/CONCERNS.md` documents known issues: `/api/update` query-string secret + GET side-effects, monkey-patch of `@astro-notion/loader` internals (`src/utils/astronotionloaderpatch.ts`), leftover `console.error` debug logging, full-SSR adapter for a prerenderable site, unbounded image downloads, README/config drift
- Frontend development is the *next* project after this one — user wants certainty first
- User communicates in Turkish; repository docs and planning artifacts stay in English
- Full codebase map available under `.planning/codebase/` (STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, INTEGRATIONS, CONCERNS)

## Constraints

- **Tech stack**: Astro + Netlify + `@astro-notion/loader` + `@netlify/blobs` — the existing prototype works; harden, don't rewrite
- **Security**: secrets must never live in the repo, URLs, or query strings — the current `?secret=` pattern is a known issue this project fixes
- **Testing**: automated tests must not call the live Notion API or require real secrets — mocks and fixtures only
- **Scope**: no new user-facing features during this project — stabilization only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Unit + integration tests with mocked Notion client (Vitest) | Verifies pipeline without flakiness or secrets; fastest path to confidence | — Pending |
| Fix `/api/update` security while testing it (header-based secret, remove GET) | Testing the hook surfaces its flaws anyway; fixing now avoids re-testing later | — Pending |
| Persistent English `SCHEMA-CHANGE.md` guide | User wants to learn the "add a Notion column" pattern once, reusable forever | — Pending |
| Evaluate SSR → prerender/hybrid migration | Simpler, faster, less fragile for a mostly-static content site; needs evidence-based go/no-go | — Pending |
| Documentation and planning artifacts in English | GSD agents and repo conventions read English; user converses in Turkish | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-15 after initialization*
