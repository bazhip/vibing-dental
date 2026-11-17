# PIMS release isolation

Approved by the user after reviewing the ungated practice review UI and the distinction between Chrome messaging availability and an installed compatible extension.

- [x] Add failing regressions for default-off review/drafts and extension-only send controls.
- [x] Add `VITE_PIMS_ROLLOUT_ENABLED=true` as the sole explicit build opt-in. Missing, false or malformed values remain off; no local settings bypass. Gate new review/draft components in both surfaces and web extension entry points.
- [x] Advertise and validate bridge protocol/capabilities. Probe the configured extension before showing Send; recheck on browser focus/visibility and discard stale responses. Preserve existing practice/free-beta eligibility inside the rollout boundary.
- [x] Validate default-off and opted-in paths, production/extension builds, translations and diff. Document release sequencing and limitations.

Scope: this is a UI rollout boundary, not authorization or proof that backend migrations are deployed. Existing server-side membership/identity/review gates remain authoritative. Enable only after backend rollout and matching extension release. A protocol mismatch fails closed, never inferred from a version string. No deployment, commit, push, new permission or model delegation.

Publication follow-up: the user subsequently requested a PR update, authorizing commit/push of the accumulated changes to existing draft PR #104 as bazhip. This does not authorize merging, enabling rollout or deploying migrations. Keep the isolated worktree for PR feedback.

## Verification record

- RED: 20 regression failures demonstrated exposed default-off UI, legacy/incompatible ping acceptance and free-beta bypass. Two additional failing regressions proved direct dialogs mounted and handovers consumed data before rollout.
- GREEN: gates wrap component mounting rather than hiding rendered markup, so disabled review/drafts/dialogs do not subscribe or fetch. The shared send flag exits before database reads while off, including during free beta. The handover hook leaves pending data untouched.
- Handshake probes cover pending, rejected, absent, malformed, incompatible, cold-worker retry, focus/visibility refresh, native/unavailable bridge, unmount, eligibility changes and out-of-order replies.
- Existing side-panel enabled-path tests now explicitly opt in. Default-off integration tests cover a practice whose send flag is already enabled. Settings snapshots return byte-for-byte to HEAD (no remaining snapshot diff).
- Full regression: 288 files / 3,230 tests passed, including the 77 real PostgreSQL cases in the disposable network-disabled container. Production build (lint/types/i18n), default development extension and opted-in store extension builds passed. Translation check: `todo=0 remove=0`; diff check clean.
- Browser scope: synthetic RecordNotePanel plus review/draft entry controls; rollout off / absent / legacy / compatible handshake at 1440, 390 and 320px (12 captures), with long patient/owner names. No horizontal overflow or page errors; off makes zero extension probes. Representative desktop/phone screenshots inspected with actual document styles. External requests blocked. This is not a full-app review or a real installed-extension/vendor test.
- Final review: author self-review; no model delegation. Checked all production call sites, default flag precedence, transport validation, stale-probe cleanup and backend isolation. No additional product changes from the review.
- Logs: `/private/tmp/pims-rollout-final-tests.log`, `/private/tmp/pims-rollout-build.log`, `/private/tmp/pims-rollout-extension-default.log`, `/private/tmp/pims-rollout-extension-store.log`, `/private/tmp/pims-rollout-i18n.log`, `/private/tmp/pims-rollout-visual.log`.
