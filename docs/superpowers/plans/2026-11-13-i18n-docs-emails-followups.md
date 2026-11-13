# Plan 3 follow-ups (carry into plan 4 / later)

Deferred items from per-task and final reviews of plan 3. None block merge.

- Task 1: minor (deferred): no test for useProfile conditional read; new-template language before usePracticeLanguage loads (race); ownerReportAi still uses LOCALE_LABELS in prompt (harmless).
- Task 2: minor (deferred): de greeting informal "Guten Tag Damen und Herren"; lowercase practice fallbacks after "Gracias,"/"Obrigado,"; no backfill for practices already auto-sending English default.
- Task 3: minor (deferred): grid-label width test omits Courier-Bold (arithmetic says fits).
- Task 4: minor (deferred): _shared modules outside tsc include; it reminder title lowercase fallback "il Suo studio"; duplicated base-tag parsing; resend_invite overwrites stored language.
- Task 5: minor (deferred): non-string metadata language breaks eq (printf "%v" guard); en authEmail bundled in main chunk; confirm USER_UPDATED causes no refetch flicker (fold into fix).
- Task 5: minor (deferred): prelude test checks string only; done-guard never cleared within session (edge case).
- Task 6: minor (deferred): weak fr mapping assertion.
- Task 8: minor (deferred): AGENTS.md should list lint blind spots (Error() without new, concat, ternary, member callee); iteratorHelpers file-level disable; OwnerReportTemplatesModal raw e.message; useTeam double failure sentence.
- Final review: ready to merge (no Critical/Important). Ruling: small fix wave for cheap user-visible minors 1 (match any REPORT_LOCALES standard on language switch), 3 (OwnerReportTemplatesModal errorText), 4 (EnglishGoverns hide when language unresolved), + owner checklist notes (verify cron SQL placeholder fallbacks; practices UPDATE RLS). Minor 2 (picker 'same as app') left as follow-up. Fix wave dispatched (FIX_BASE c5ab54b, sonnet).
- Client-language picker: add 'Same as app language' option / allow clearing to null (final review Minor 2).
