# Radiology free-text refinement plan

**Goal:** One always-visible radiology editor, with the previous source prompts as placeholder guidance, explicit AI refinement and automatic refinement after radiology dictation stops.

**Design:** Reuse Treatment report's single-editor layout and GitHub/Atlassian's compact editor/action hierarchy, adapted to shared clinical controls. Keep language selection and existing review-before-export controls. Refinement replaces text in the same editor and offers Undo. Keep legacy findings/context in storage; on first display combine legacy source fields only when no report field exists. An explicitly cleared report stays empty. No second source form or proposal editor.

**Architecture:** Add a pure legacy-draft/append helper to radiologyReportState. Send the current editor text as the refinement source, preserving the existing authenticated request/tool response validation. Retain stale source/auth/session/read-only guards. A completion callback after VoiceInputButton's existing drain/final check notifies EntryGrid, which requests refinement only if that dictation appended radiology text. English voice request/prompt bytes stay unchanged. Language is passed from the dictation session.

- [x] Add failing tests for single editor, preserved legacy content/clear, refine/undo and current-text request semantics.
- [x] Simplify component/CSS; preserve review/export and async guards; translate all new UI in en/fr/de/it/es.
- [x] Add guarded dictation-completion callback and append/refinement wiring with completion/session tests.
- [x] Focused tests, translation stamps, full test/build, desktop/320/390 light/dark screenshots including empty/populated/long/read-only/error/refining/undo and menu states as applicable.

No migration or deployment required. Existing legacy fields remain readable for older records and exports; refinement uses the visible editor text, not deleted hidden legacy values. Native runtime/live AI/microphone services will be stated as unverified when unavailable.

## Review and verification

Independent adversarial review: PASS, 17 focused files / 616 tests, plus TypeScript and diff checks. Review findings fixed: authoritative editor text now feeds clinical record/PIMS note composition, stale-note basis, client-report AI facts, chart PDF content/code legend, admin chart viewer and report-only autosave eligibility. Explicit clears suppress superseded hidden findings throughout. Dictation language is passed through applyAiActions to the radiology append handler; report language derives from stored session language and Undo restores the original language. Language changes release pending busy state while discarding obsolete responses. English voice prompt and request-construction snapshots remain unchanged and pass.

Production build passed (translation validation, lint, TypeScript and bundling); extension store packaging passed; translation catalog check reports todo=0 remove=0. The isolated final `PIMS_TEST_CONTAINER=toothops-pims-foundation-20261116 npm test -- --maxWorkers=4` run passed all 4,611 tests across 346 files (exit 0). Two overlapping full runs shared the disposable foundation database and failed there due to concurrent schema resets; both exited before the isolated rerun. No product change was made in response to that fixture collision.

| Surface/state | 1440px light/dark | 390px light/dark | 320px light/dark |
| --- | --- | --- | --- |
| Single-editor empty placeholder, populated, legacy context, long text | Captured/asserted | Captured/asserted | Captured/asserted |
| Refine pending, refined, Undo, automatic completion | Captured/asserted | Captured/asserted | Captured/asserted |
| Refinement error, PDF error, reviewed, read-only, AI unavailable | Captured/asserted | Captured/asserted | Captured/asserted |
| Whole Imaging workspace: empty/populated/long sources, long patient name, single/multiple visits, saved read-only | Captured/asserted | Captured/asserted | Captured/asserted |

78 component captures plus 30 full-workspace captures; zero page errors, no horizontal overflow, exactly one editor, at most one primary action, 44px phone action targets and visible keyboard focus. Representative screenshots visually inspected across each viewport/theme and listed state groups. The helper paragraph is associated with the editor, and guidance from the removed fields appears inside the empty field. Native report-language select popup styling was not screenshot-reviewed. Whole-workspace image-history failure in the synthetic cloud fixture is an expected mocked-service state, not a radiology runtime failure.

Local artifacts: /private/tmp/radiology-free-text-visual.{cjs,json,log}; /private/tmp/radiology-free-text-workspace-visual.{cjs,json,log}; screenshot prefixes radiology-free-text-* and clinical-day-workspace-*-imaging-*. This is scoped coverage of the changed UI, not a full application review. AI transport, consent, clipboard and PDF sharing use local mocks in screenshots; their guards/request construction are unit-tested. Live cloud/AI/microphone services, installed browser helper and native runtime remain unverified. No production migration/deployment was performed.
