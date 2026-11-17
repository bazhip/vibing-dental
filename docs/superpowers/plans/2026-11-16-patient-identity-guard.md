# Patient identity guard implementation plan

> Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Require deliberate approval before overwriting an established patient identity.
**Architecture:** Read saved identity in the shared save path. Compare normalized fields and use the shared choice dialog; bind dismissal and approval to the exact chart and identity pair. Explicit restoration keeps its existing confirmation.
**Tech stack:** React, TypeScript, Supabase, i18next, Vitest.
**Spec:** ../specs/2026-11-16-patient-identity-guard-design.md

## Constraints

No production data changes. Reuse shared UI. Translate en/fr/de/it/es. Keep normal saves and first-time identifier entry working. Do not auto-copy clinical content.

## Review focus

Reloads with changed local identity; chart switches during prompts; new edits during prompts; failed identity reads; cancelled autosave retry loops. Each gets a hook regression test.

## Task 1: Save guard

- [x] Extend the Supabase mock and add failing identity-change regression tests in src/hooks/useCloudSync.autosave.test.tsx.
- [x] Run the focused suite and confirm new tests fail on unchecked writes.
- [x] Add src/utils/patientIdentity.ts for normalization and translated dialog options; integrate in src/hooks/useCloudSync.ts before upsert. Keep confirmation exclusive, reject stale answers, suppress repeated automatic prompts after dismissal, and fail closed on read errors.
- [x] Add translations in src/locales/{en,fr,de,it,es}/app.json and stamp new keys.
- [x] Run focused tests including existing restore, duplicate, and conflict behavior.

## Task 2: Interaction verification

- [x] Exercise the actual shared dialog with the production guard in a local mocked browser fixture, at desktop/390/320px with long identities; verify Cancel/Escape/backdrop, approval, focus, and no overflow.
- [x] Inspect screenshots and fix the owning layout if necessary.
- [x] Run npm test and npm run build; inspect full diff for races and unsupported bypasses.

## Execution notes

Implemented inline in the supplied checkout without production mutations. The user approved the design, then requested a pull request after verification.


## Verification results

- Final `npm test`: 270 files, 2,783 tests passed.
- Final `npm run build`: passed translation checks, lint, TypeScript and Vite. Existing bundle-size warning remains.
- Independent review found two races, both reproduced by failing tests and fixed: clinical edits during confirmation and server identity changes during confirmation. Follow-up review passed.
- Browser fixture uses the production hook, question builder, shared dialog and theme styles with a mocked Supabase client. No live data writes.

| Dialog state | Desktop 1440px | Phone 390px | Phone 320px |
| --- | --- | --- | --- |
| Ordinary name and number | Inspected | Inspected | Inspected |
| Long name and unbroken identifier | Inspected | Inspected | Inspected |
| Dark mode, long identity | — | — | Inspected |
| German, long identity | — | — | Inspected |

Browser checks passed: Cancel receives focus; focus stays contained; Cancel, Escape and backdrop dismiss without a write; explicit correction writes once; dialog stays within viewport and mobile controls retain 44px touch targets. Screenshots were inspected in the temporary `patient-identity-mpa9gC` artifact directory.

This was a focused dialog review, not a full application UI review. Native iOS rendering and live authenticated application navigation were not visually exercised. Patient names containing no identifier are covered through the localized fallback test. No production records were changed, and the feature has not been deployed.

Remaining limit: this client-side guard does not make concurrent database writes atomic. The second read rejects identity changes during the dialog, but preventing every race between that read and the write would require a separate conditional server-write change.
