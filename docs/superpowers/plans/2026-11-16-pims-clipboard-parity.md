# PIMS clipboard parity implementation plan

**Goal:** Translate the shipped extension's section/all-note and PNG clipboard behavior into ToothOps, without inventing clinical write contracts.

**Design:** A shared manual-transfer section in the existing web send dialog and extension chart view offers Copy all, Copy chart picture, and expandable individual-section controls. It remains available when automatic sending cannot verify the destination. Copying never sends to a PIMS or stamps a chart as sent. The extension practice send flag still gates this feature. Existing typography and colors are retained; no image-upload UI changes.

**Evidence:** ScribbleVet 1.31.3 `sidepanel.b7741352.js:202494` constructs text/plain and text/html or image blobs; `:212598` joins text sections, excluding images. ToothOps keeps its own escaped clinical formatting and existing text fallbacks. PNG copying uses a deferred ClipboardItem blob to preserve user activation, and reports completion only after the write succeeds. This is functional adaptation, not byte-equivalent output or live PIMS verification.

**Architecture:** `utils/pims/clipboard.ts` builds clipboard content from generated or edited notes and handles PNG clipboard writes. `components/pims/CopyActions.tsx` handles UI and outcomes; both existing send surfaces mount it. Pulse discovery is a separate bounded adapter improvement from `pulse.b8ec9667.js:435,475` and `oldPulse.0d5ec2ea.js:456`; writes stay disabled.

**Tech Stack:** React, TypeScript, existing i18next catalogs, Vitest/Testing Library; no new dependency, browser permission, or remote request.

## Tasks

- [x] Write failing clipboard-content and PNG tests; implement helpers.
- [x] Write failing copy-control tests; implement shared component and add both send-surface integrations and regressions.
- [x] Add all five translations, pseudo-locale tests, and translation stamps.
- [x] Implement/test source-backed read-only legacy Pulse discovery.
- [x] Run focused and full tests, production and extension builds; review the diff and update the parity ledger.

## Verification

- Full suite: 260 files / 2,771 tests pass. The first full run caught translation consistency and glossary drift; corrected manually and rerun successfully.
- Production build passes translation validation, lint, TypeScript and Vite. Two new test mock/call signatures were corrected after the first build's type check.
- Development and store extension builds pass; output assertions verify both page bridges, clipboard CSS, unchanged permissions/hosts and production-only messaging origins.
- Translation backlog: `todo=0 remove=0`. `git diff --check` passes.
- Independent adversarial review passes, including 162 focused tests. Clipboard activation/permission behavior and live PIMS paste/persistence still require authorized browser testing.

## Review focus

- Edited text, including deliberately empty text, must never be replaced with generated content.
- Clipboard failure, denied permissions, or manual prompt must never display a false success or update PIMS send history.
- PNG writes must be initiated during the user gesture, with no URL fetching or malformed image accepted.
- Repeated clicks, changed charts/notes, and unmounted views must not expose stale success messages.
- Legacy field discovery must not click controls, write content, infer encounter identity, or enable exports.
