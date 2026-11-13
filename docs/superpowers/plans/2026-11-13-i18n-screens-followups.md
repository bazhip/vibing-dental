# Plan 2 follow-ups (carry into plans 3–4)

Deferred items from per-task and final reviews of plan 2. None block merge.

- Task 1: minor (deferred): attribute coverage tests for alt/button value; hook vs switcher disagreement while saved=null (Task 11); re-verify chunk split at Task 11.
- Task 1: minor (deferred): switcher sets html lang without re-check after changeLanguage; pseudo arrays test leaks test.list into en/common and leaves xx installed; no auto-retry on reconnect.
- Task 2: minor (deferred): CodeField popup not re-rendering on language switch; B/B de/fr nit; es T/NE nit; CodeReferencePanel remaining English → Task 5.
- Task 3: minor (deferred): unmapped Supabase errors pass raw English (plan 3 server-errors); dead key landing.demo.colStage; it "non corretta"→"corrette"; it tipSender repetition; es signInInstead loses "instead"; stored error keeps old language after switch.
- Task 4: minor (deferred): duplicate-visit dialog formatDate(medium) English output vs pre-localization unverified; brittle '2026-11-12 · latest' test relies on fake clock.
- Task 5: minor (deferred): chart.i18n allow-list regex hides all-caps tokens incl. R/L/D/G diagram labels — narrow it + assert fr diagram labels; French test name overclaims; ordinal ≥5 loses digit; en curly apostrophe drift in diagramView.numbersTitle; `in LABEL_KEYS` → Object.hasOwn; eslint excludes tool/rowClass global.
- Task 6: minor (deferred): drop 'DICOM'/'DICOM ↓' from forms test ALLOW; fr extraoral "facial"→"face"; whitespace-only line in DocumentsModal; raw Supabase messages in useAttachments (plan 3 server errors); originalFailed mixes raw message.
- Task 7: minor (deferred): noMatch strings never rendered in test (misleading comment); raw ISO dates inside titles/aria (consistent with ISO ruling); unanchored reminder allow regexes.
- Task 8: minor (deferred): trial/never-subscribed paths untested under pseudo (PAID_SIGNUP=false); dead 'Sign out' allow entry; half-anchored email regex; walkthrough "eight sections" vs nine.
- Task 9: minor (deferred): previewFailed/saveFailed paths not rendered in test; confirm/toast strings not DOM-scanned; localized "Untitled template" persisted as name.
- Task 10: minor (deferred): verifyApiKey messages (apparently dead code); downloaded transcripts mix English headings + active-language activity lines; 'no cloud'/'no token' raw errors in useVoiceCapture.
- Task 11: minor (deferred): pseudo-coverage IMPORT regex counts `import type`, `typeof import()` in vi.mock, commented imports; no tests for sign-in transitions (null account inherits device; account 'it' mirrors to app.language); VoiceInputButton:652 inline getFixedT; LintScope interface duplicated; shared-device language inheritance.
- Ruling: fix wave = I1+I2 (resolve+load language before first render in index.tsx with timeout fallback; module-level latest-request token instead of per-effect cancel; account-aware language in BillingGate blocking branches), I3 (glossary term chart_record + normalise all namespaces), plus cheap minors 5 (stale t in toasts), 6 (race, covered by token), 8 (it Lei capitalisation consistency), 9 (pseudo-coverage: skip import type/typeof import/comments; widen scope to all src/**/*.tsx components outside i18n/testing). Minor 4 (first-load +35KB gz) left as follow-up — lazy en namespaces risks raw keys at first render — cost if wrong: slower first load.
