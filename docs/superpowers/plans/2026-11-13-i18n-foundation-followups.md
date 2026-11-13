# Plan 1 follow-ups (carry into plans 2–4)

Deferred items from per-task and final reviews of the i18n foundation. None block merge.

- Task 2: complete (commits 359b77c..d108be2, review clean). Deferred to plan 2 (enable switching): wire logged-out localStorage `app.language`; avoid browser-language flash while prefs load; confirm update() applies optimistically. Task 7 must extract AccountModal's "Language" label (dup h3/label).
- Task 4: minor (deferred): de Mund/Maul convention note; de Leitungsanästhesie synonym note; fr dent temporaire / dent incluse notes; es diente discrómico idiom; it attrizione note; glossary.test cwd-relative path; test should forbid `/` `(` in values and unknown keys.
- Task 5: minor (deferred): API-key check belongs in main(); `void main()` unhandled rejection → .catch with clear msg; quadratic array copy translate.ts:333; GlossaryTerm redefined in work.ts; consider structured outputs instead of prompt-JSON.
- Task 5: minor (deferred): ICU-version dependence of plural categories; --rehash ignores named key that matches nothing (warn).
- Task 6: minor (deferred): it warningSigns ambiguous clause; it brushing subjunctive "possa"; PDF-per-locale test weak (byteLength only); PDF/WinAnsi tests not RED; strings cache not HMR-invalidated.
- Task 6: minor (deferred): orphan meta entries (keys removed from catalogs) not flagged by checker/removed by translate.
- Ruling: extract accountDeletion.ts strings + friendlyError's own messages (common ns) now; raw backend err.message passthrough deferred to plan 3 ("server errors → codes") — cost if wrong: English backend text in rare errors until plan 3.
- Task 7: minor (deferred): react-hooks stub comment; "Doctor name"→vétérinaire wording check vs glossary; lint tests for native-tag t() attrs & AdminPanel ignore.
- Task 7: minor (deferred): "DELETE" typed token stays literal (French users type English word); x.toast member false-positive possibility.
- Final review: ready with fixes — I-1 writeCatalogs rewrites/sorts all files incl. en; I-2 lint scans build/docs bundles; I-3 owner must add ANTHROPIC_API_KEY. Minors M-1 bundle +28KB gzip (lazy-load in plan 2), M-2 glossary lacks pt, M-3 unhandled rejection, M-4 no fallbacks.
- Ruling: fix wave = I-1 (sort committed catalogs once + writeCatalogs writes only changed files, never en) + I-2 + two cheap deferred items (workflow key gate only when translation work exists; --rehash warns on named key matching nothing). M-1..M-4 left for plan 2 — cost if wrong: small.
