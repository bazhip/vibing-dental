# Persisted clinical transfer drafts

Approved authority: `docs/superpowers/specs/2026-11-16-pims-backend-parity-design.md`.
Workspace: isolated `9bb5`, branch `feat/pims-extension-parity`; main merged at `7e25645`.

## Implementation ledger

- [x] Database: persisted history/radiology drafts, optimistic versions, actor-bound replay, source fingerprints, review/export authorization.
- [x] Client: strict RPC decoding, deterministic composition, literal-preserving PDF and manual text export.
- [x] Shared editor: explicit source selection/review, stale-result handling, web and extension entry points, translations/pseudo-locale tests.
- [x] Verification: PostgreSQL regressions, tests/builds, translation checks and self-review (independent review and hosted/live verification remain separate gates).

Ruling: manual draft preparation starts with the explicitly opened practice chart, not name-based patient history aggregation. The chart is its source of truth; no external patient identity is asserted. Automatic upload must separately verify a connection/patient link. This avoids treating private chart ownership as permission to publish into a practice integration.

Ruling: PDF generation must reject unsupported font characters rather than silently strip clinical text; lossless UTF-8 text remains available. No vendor service or image interpretation is called.

Ruling: all writes stay uncommitted until verification, preserving the previous uncommitted foundation/reconciliation work. No worker delegation or model-routing changes.

## Review and regressions

Self-review only; no independent reviewer was dispatched because the available worker routing conflicts with the user's model restriction.

- Obsolete approval replay and concurrent edits have real PostgreSQL regression coverage; the focused database run passed 16 draft tests.
- Composition now rejects disagreement between snapshot and source patient identity. The added mismatch regression failed before the guard and passed after it.
- The full-suite run caught Spanish glossary drift (`ficha` instead of `historial`) and a single-listener auth mock. Translations were corrected; the mock now models Supabase's multiple subscribers without weakening production sign-out handling. All 32 targeted regressions pass.
- Uncertain writes retain typed text but block additional mutations until reload. Access revocation clears cached source content; PDF export reauthorizes after rendering.
- Full-suite load exposed a results-heading assertion racing its passive focus effect. The isolated 43-test dialog suite passed unchanged; the assertion now waits for the existing effect rather than changing product focus behavior.

## Rendered coverage

Synthetic shared-editor harness, local requests only; no live PIMS or clinical data.

| State | Desktop 1440 | Phone 390 | Phone 320 |
| --- | --- | --- | --- |
| Empty/new draft | Captured | Captured | Visually inspected |
| Multiple drafts, long identity | Captured | Captured | Visually inspected |
| Reviewed draft | Visually inspected | Captured | Captured |
| Stale source | Captured | Captured | Captured |
| Unknown write outcome | Captured | Visually inspected | Captured |

All 15 captures reported no page errors or horizontal overflow; measured buttons/selects/textareas meet 44px targets. Inspected reviewed/unknown states after adjusting checked approval, primary-copy emphasis and disabled-content readability. This is not full-app/device coverage: actual modal/panel parents, every locale, native sharing, expanded native select menus and live provider uploads are not visually verified here. Temporary preview files were removed.

## Final validation

- `PIMS_TEST_CONTAINER=toothops-pims-foundation-20261116 npm test`: **286 files / 3,199 tests passed**, including 77 real PostgreSQL cases; no database skips. Log: `/private/tmp/pims-drafts-final-tests.log`.
- `npm run build`: passed (TypeScript, lint, translation checks and production bundle).
- `npm run build:extension` and `npm run build:extension -- --store /private/tmp/pims-drafts-store`: passed. Store manifest retains the existing hosts and permissions, production-only external messaging and no debugger permission.
- `npm run i18n:translate -- --check`: `todo=0 remove=0`.
- `git diff --check`: passed. Existing bundle-size/dynamic-import and test-environment canvas/localStorage warnings remain; none failed validation.
- Final self-review checked source/approval invalidation, member/private-chart boundaries, mutation replay and concurrency, stale UI responses, literal-preserving exports and absence of send stamping. No claim of independent review or full end-to-end provider parity.
- Main's UI merge remains at `7e25645`; no commit, push, deployment or live PIMS write was performed in this increment. Prior uncommitted foundation/reconciliation changes are preserved.
