# Findings-first radiology authoring

User approved the proposed natural-language findings → editable report flow. Refine the existing implementation in the parity worktree, preserving all prior changes.

Design: GitHub primary editor + optional-details disclosure, adapted to teal clinical controls. Put the existing CodeField findings input inside RadiologyReportSection. Keep history, technique and question optional and collapsed. Collapse the empty manual report editor; show existing report editors. Generate only from recorded findings, with optional chart context. Omit undocumented optional report sections rather than filling the report with placeholders. Never infer diagnoses, normal findings or recommendations. Preserve explicit apply/review/export and stale-operation guards. No claim of exact competitor output.

- [x] Add failing component and generator tests for findings-first editing, optional context, manual authoring, source gating and concise output.
- [x] Implement component integration, source checks, parser/prompt and en/fr/de/it/es copy.
- [x] Stamp translations; run focused tests and build.
- [x] Inspect 1440/390/320px screenshots for empty, findings, context, preview, used, reviewed, stale, read-only, long and error states.

No deployment, commit or provider request is required.

Verification: focused6 suites86 tests passed; independent reviewer6 suites91 tests and TypeScript passed. Production build, translation check (todo=0 remove=0), diff check passed. Reviewer caught lost walkthrough/native hooks; retained the existing findings wrapper/title/textarea classes, fixed owning separator CSS, and regression-tested the hooks. Clearing the last character of a manual report now leaves its editor expanded.

Visual coverage: synthetic component harness, web1440/390/320 ×13 states (empty, findings, expanded context, preview, applied, reviewed, stale, read-only, generation error, long names/text, PDF error, manual authoring, expanded code autocomplete), plus native-CSS390/320 ×4 states (findings, context, preview, manual). 47 cases, no browser errors or horizontal overflow, visible controls≥44px, ≤1 primary action. Inspected desktop, phone, native CSS, long text, autocomplete and empty-state screenshots. Artifacts: /private/tmp/radiology-findings-{ui,native-ui}.log and corresponding screenshots. This is component verification, not full app/visit navigation or native runtime/live AI/provider verification.

Full regression checks exposed two existing Instinct test timing assumptions: a1-second UI completion wait and an assumption the first concurrent crypto digest must finish first. The latter was corrected to require exactly one submitted result and one unknown duplicate, preserving per-request IDs and exactly-once persistence/dispatch. Both existing suites passed together100 tests. Final full suite: `PIMS_TEST_CONTAINER=toothops-pims-foundation-20261116 npm test -- --maxWorkers=4` passed331 files/4,370 tests, including disposable PostgreSQL cases. Final `npm run build`, `npm run build:extension`, translation check and diff check passed. Full-suite log: /private/tmp/radiology-findings-verified-tests.log; build: /private/tmp/radiology-findings-verified-build.log. The concurrency assertion correction received an independent PASS and81-test rerun.

Final browser replay uses the real report request builder and parser, with only the AI service response simulated; all47 cases still pass. This validates omitted optional sections in the generated preview without a live AI request.
