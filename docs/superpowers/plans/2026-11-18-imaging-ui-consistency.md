# Imaging UI consistency plan

**Goal:** Bring Imaging's report area into the same clinical form system as Consultation and Treatment, preserving all report behavior.

**Reference/mockup:** Reuse the app's SectionHeader description slot, Treatment's single full-width editor styling with a compact eight-row default, shared primary/secondary controls and compact GitHub/Atlassian form/action hierarchy. Mockup shown: title+short helper, editor, language then refinement/Undo, compact review/export footer; repeat for CT. Keep teal/neutral tokens and 44px phone targets.

- [x] Remove report-specific double separators, compounded header spacing and oversized editors. Use the compact eight-row size, following the user’s latest instruction to restore the size change. Let the owning Imaging grid space its sections.
- [x] Use shared header descriptions, compact field dimensions and primary button classes; align language before refinement, consolidate review/export controls, avoid duplicate access notices.
- [x] Shorten helper/placeholder copy in all five app languages and explicitly stamp changed translations.
- [x] Run existing report/navigation/pseudo tests and full test/build; review screenshots at 1440/390/320 in light/dark for empty/populated/long/read-only/refine/Undo/export/error states. Record scoped coverage and runtime gaps.

No changes to stored text, AI requests, dictation routing, review gates, autosave or export content. This is a reversible presentation change; existing behavior tests plus rendered inspection cover it without new implementation-mirroring tests.

## Verification and scoped visual coverage

Independent review PASS: 45 tests /4 files, TypeScript and diff checks; all five app-language strings reviewed, translation validation reports0 problems. Existing refinement, Undo, review, copy/PDF and chart/session/language guards remain unchanged. The accessible report label/description and walkthrough hooks remain intact. Production build and extension packaging pass; translation catalog check is current. The final full run with the disposable PIMS database passed all 4,623 tests across 346 files.

The final styling uses SectionHeader's description slot, the shared surgery-report textarea class (8 rows /180px minimum), shared entry-grid primary buttons and clinical input tokens. Language precedes refinement in the toolbar; review and export share a responsive footer. One source of spacing in Imaging replaces report-level double separators. Redundant status/access text is removed while the checkbox and export gates remain. The user briefly requested the old size, then explicitly requested restoring the compact size; the final implementation follows that latest instruction.

| Changed surface/state | 1440px light/dark | 390px light/dark | 320px light/dark |
| --- | --- | --- | --- |
| Radiology and CT: empty placeholder, populated, legacy/no CT source, long text | Captured/asserted | Captured/asserted | Captured/asserted |
| Refining, refined, Undo, programmatic completion, generation/PDF errors | Captured/asserted | Captured/asserted | Captured/asserted |
| Reviewed/read-only, AI unavailable, keyboard focus | Captured/asserted | Captured/asserted | Captured/asserted |
| Full Imaging page: both reports, empty/populated, long patient name, single/multiple visits and saved read-only | Captured/asserted | Captured/asserted | Captured/asserted |

186 captures (78 radiology,78 CT,30 whole-workspace), zero page errors and horizontal overflow; one primary per report context and 44px phone action targets. Representative images visually inspected across viewport sizes/themes and the listed state groups. Shared selectors and primary buttons align, text wraps, and review/export controls remain discoverable. No new menus were added; native select popup styling was not reviewed. Image-history failure in the mocked cloud fixture is expected and unrelated to the report area.

Artifacts: /private/tmp/imaging-ui-{radiology,ct,workspace}-visual.log; data JSON and screenshots use the existing radiology-free-text-*, ct-report-* and clinical-day-workspace-*-imaging-* patterns. This is scoped verification of the changed UI, not a full application review. Screenshot services are mocked; live AI/cloud/clipboard/file sharing and native runtime remain unverified. No deployment or data migration was performed.
