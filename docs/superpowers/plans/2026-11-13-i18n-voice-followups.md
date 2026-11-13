# Plan 4 follow-ups

- Task 1: minor (deferred): keyterm cap `break`→`continue`; redundant identity aliases; no test of startDeepgramSession lng forwarding (Task 6 wiring test should cover).
- Task 2: minor (deferred): "mobilité un sur la…" article guard; score-first takes hundreds word ("mobilité deux cent quatre" → 2 104) — document; it "cento e quattro".
- Queued follow-up (separate small PR after voice): reminder cron follows client language — (a) app: usePracticeLanguage.save + reminder settings persist localized default when stored subject/body empty and reminder_auto on; (b) migration replacing send_due_reminders: coalesce names to '' (NULL → empty email body risk), practice-name fallback per client_language instead of English 'Your veterinary practice'. Cron itself inserts no English name fillers (verified from function body 2026-11-13).
- Task 5: review → Approved w/ Important (looseMatch: free text without key tokens matches anything incl. empty). Minor deferred: en '8T' phrasing differs; tech never dictates a finding; offline tests don't tie actions to transcripts.
- Task 6: minor (deferred): normalize decimal comma in dedupe in-reply key and "0,5 mL" with unit; hand-typed "0,5" chart value re-apply (harmless).
- Final fix wave re-review clean (985d2ed..39ff025). Minor deferred: Deepgram Error msg then retry shows error; bad-token close triggers one retry; flushed audio lost on retry.
