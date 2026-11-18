# Chart PDF export warning implementation plan

**Goal:** Warn at chart PDF download/share when unsaved or unfinalized, offering Finalize and download, Download anyway, and Cancel.
**Architecture:** Pass live lifecycle state and an async finalizer from EntryGrid through DocumentsModal to PdfPreviewModal. Render an accessible confirmation using shared dialog styles. Keep download bytes bound to the preview generation; cancel stale async completion.
**Spec:** ../specs/2026-11-18-chart-pdf-export-warning-design.md
**Constraints:** Preserve autosave, unrelated local edits, clinical tokens, all enabled translations, image-warning consent and native sharing.

- [x] Add failing download tests for warning, bypass, cancellation, finalization failure/success, duplicate taps, local charts, stale previews and missing images.
- [x] Implement warning in PdfPreviewModal and lifecycle wiring in DocumentsModal/EntryGrid. Finalization saves pending edits through existing cloud.setFinalized.
- [x] Translate all new strings in every enabled locale and stamp metadata.
- [x] Run targeted tests, npm test and npm run build; inspect desktop and 320/390px screenshots.
- [ ] Review diff, commit only feature files/hunks, push branch and create PR.

## Visual verification

Chrome harness rendered the actual DocumentsModal and PdfPreviewModal with app styles and a valid fixture PDF; lifecycle outcomes and cloud access were mocked. Screenshots inspected for wrapping, alignment, overflow, controls and focus.

| State | 1440px | 390px | 320px |
| --- | --- | --- | --- |
| Unsaved + unfinalized, long patient name | inspected | inspected | inspected |
| Unfinalized only | — | — | inspected |
| Unsaved only | — | — | inspected |
| Finalization unavailable (local chart) | — | — | inspected |
| Busy / failed finalization | — | — | inspected |
| German long labels | — | — | inspected |
| Nested save confirmation above warning | — | — | inspected |

Buttons measured at least 44px; no warning overflow. Escape dismisses the warning; nested confirmation cancellation returns to it. Single/multiple visit list layouts and empty library states are outside this modal change. Actual iOS runtime and authenticated cloud saves were not browser-tested; native dispatch, dismissal propagation, persistence sequencing and failures are covered by automated tests and code review.

Review found and corrected native close propagation, busy focus/feedback, portal keyboard bubbling and nested save-dialog stacking. Independent scoped review: PASS.

Final verification: 288 test files / 3,104 tests passed with `npm test -- --maxWorkers=2 --testTimeout=15000`; `npm run build` passed. The multilingual font/PDF test exceeded its default five-second timeout under concurrent load; the final run used a 15-second per-test timeout.
