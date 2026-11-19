# Observed PIMS upload parity implementation plan

**Goal:** Deliver the recovered Instinct PDF submission and ezyVet image editor/save workflows through the real extension UI.

**Scope decision:** The user explicitly requested “just get parity” after the distinction between provider acknowledgment and independently verified saved bytes was explained. This supersedes the requirement that independent downloaded-byte verification must gate these compatibility workflows. Existing strict verification utilities remain separate and unchanged.

**Architecture:** Instinct uses a one-use, page-bound preparation ticket and the recovered authenticated multipart GraphQL mutation. The existing reviewed-draft workflow supplies a revalidated PDF. The extension background records an attempt before dispatch and prevents replay after unknown outcomes. ezyVet continues through the existing reviewed-image mapping and editor/save route. Neither path claims independent saved-file verification.

**Evidence:** ScribbleVet 1.31.3, REA record `ev_62894914c7b9b8b61dfbac42f7bdcd75aaa6dfdc2ab9052e7963606e3ef74810`, artifact SHA-256 `51eab8d0307b6acec82701ca2313536f41066361c5b4a10c6fdb82485ac92524`. Instinct multipart dispatch and response handling: `instinct.9eb2d42a.js:25224`. ezyVet PNG editor insertion and save: `ezyvet.2faddd27.js:178`, `:327`, `:445`.

## Constraints

- Isolated existing worktree only; preserve unrelated uncommitted work.
- No new host/debugger permissions, live clinical writes, deployment, commit, or push.
- Existing default-off rollout remains unchanged.
- Instinct's recovered location ID `1` is an explicit compatibility default presented for review, not inferred active-location evidence. Use private documents rather than silently sharing them.
- Unknown outcomes never become verified or automatically retryable.
- Every new user-visible string translated in all five application languages.

## Execution

- [x] Provider worker: implement/test page-bound Instinct prepare/submit with real session authentication, multipart upload, acknowledgment semantics, and no readback dependency.
- [x] Main: wire protocol, transport, page bridge, background authorization and persistent replay protection; cover missing extension/provider/navigation/concurrent request cases.
- [x] UI worker: reuse reviewed drafts with destination review and explicit submit; reject stale renders and changes in chart, selected draft or target; add translations and pseudo-locale tests.
- [x] Reviewer: trace ezyVet saved-image selection to actual editor save; fix concrete parity gaps rather than invent another provider abstraction.
- [x] Integrate, independently review, run focused and full tests, build app and extension, inspect changed UI.

## UI placement

Use the existing reviewed-draft actions and the app's existing review-before-write pattern (as in GitHub review/confirmation flows). Beneath Copy / Download PDF, show Review Instinct destination, then a compact destination summary (origin, patient ID, compatibility location), confirmation checkbox and one Submit PDF action. Results explicitly distinguish Submitted, Not submitted, and Outcome unknown. Keep clinical spacing, shared classes and keyboard controls; no unrelated redesign.

## Resumed implementation — November 17

Recovered the existing worktree and continued the compatibility workflow without discarding earlier uncommitted evidence-completion work.

- Instinct now has typed protocol, external/internal transport, a page-scoped uploader and authenticated background dispatch. Observed document, URL, provider and session changes invalidate preparation tickets.
- Background submission records a read-back browser-local claim before calling the page. Concurrent requests serialize; changing request IDs or restarting the worker does not bypass the claim for the same origin, decoded patient ID and source draft/version. Stored keys hash those identifiers. This protects one browser profile, not multiple devices.
- Regression tests reproduced absent routing (five failures), duplicate claims bypassed through percent-encoded patient IDs, and false acknowledgment of missing GraphQL mutation results. Those cases now pass. A mutation result object is required; a missing file ID remains compatible with the observed provider response behavior. Receipt IDs must match the dispatched attempt.
- Ruling: retain durable submission claims even for an explicit blocked result after claiming — conservative prevention of duplicate submission where page-call lifecycle is uncertain — a definitively blocked attempt may need manual resolution rather than automatic retry.
- Instinct uses the existing reviewed draft UI: explicit preparation, displayed origin/patient/compatibility location 1, confirmation, private PDF submission and Submitted/Not submitted/Outcome unknown states. The PDF source is exported again after rendering and target liveness checked before dispatch.
- ezyVet compatibility uses the existing immutable reviewed PNG and editor writer; the strict independent-readback transfer path remains separate. Compatibility results must distinguish editor submission from verified saved content.

Fresh final verification and visual coverage will be recorded below after integration settles. No live provider writes, permissions, rollout enablement, deployment, commit or push are authorized by this continuation.

### Review and rendered coverage

Independent boundary review passes: Instinct protocol/bridge/transport/adapter and background routing checks, plus 118 independently rerun ezyVet image/hook/result tests. Review identified and corrected the encoded-route duplicate, missing mutation acknowledgment and asynchronous image-source revalidation gaps. Image-only editor acknowledgment does not call `markPimsSent`; the existing local repeat warning remains.

| Surface | Widths | Captured synthetic states |
| --- | --- | --- |
| Actual PimsDrafts component | 1440, 390, 320 | Single/long destination, multiple drafts, empty, submitted, unknown, blocked |
| Actual web Send dialog image controls | 1440, 390, 320 | Included/long name, stale source, empty; mapping and submitted result continuations |

Instinct: 18 cases with no page errors/overflow and 44px button/select/textarea targets. Representative phone prepared/submitted and desktop multiple-draft screenshots inspected. Harness `/private/tmp/instinct-ui-visual.cjs`; log `/private/tmp/instinct-ui-visual.log`; screenshots `/private/tmp/instinct-ui-{width}-{scenario}.png`.

Images: nine initial cases plus mapping/result screenshots, no page errors/overflow or image controls below 44px. Inspected 320px included/empty, 390px stale and desktop result; main session also inspected 320px included and Instinct prepared. Harness `/private/tmp/pims-editor-visual.cjs`; log `/private/tmp/pims-editor-visual.log`; screenshots `/private/tmp/pims-editor-images-*.png`.

These are targeted component/dialog checks with synthetic backend, transport and images and blocked external requests. Live extension/provider interaction, a separate rendered ChartSend integration and full-app screen/state coverage are untested. This is not a full UI review or live interoperability claim.

### Final build validation

`npm run build`, `npm run build:extension`, `npm run package:extension` and `git diff --check` pass. Translation backlog reports `todo=0 remove=0`. Logs: `/private/tmp/pims-resume-final-{build,extension,package,i18n}.log`. Existing non-fatal chunk/dynamic-import and canvas/localStorage test warnings remain. No permissions changed in packaging.

The first combined suite passed 4,070 tests but failed to import two dialog suites whose transport mocks lacked the new method. Both mock contracts were corrected and the two suites independently pass 56 tests. The final complete rerun is recorded below.

Final `PIMS_TEST_CONTAINER=toothops-pims-foundation-20261116 npm test`: **318 files / 4,129 tests pass**, exit zero, including the disposable PostgreSQL tests. Log `/private/tmp/pims-resume-final-tests.log`. All implementation changes remain local and uncommitted.
