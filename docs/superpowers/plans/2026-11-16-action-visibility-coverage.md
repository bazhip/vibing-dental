# Action visibility verification

Viewport widths: 1440px desktop, 390px phone, 320px phone; screenshots at 900px height. Browser: local Chromium with deterministic cloud fixtures; no live email sent. Screenshots and runner logs are under `/private/tmp/action-*` on the task host.

| Screen/state | 1440 | 390 | 320 | Evidence / inspection |
| --- | --- | --- | --- | --- |
| Patient, exam, anesthesia | Captured | Captured | Captured | Section screenshots; sampled full-size inspection of forms, selected controls and wrapping |
| Chart grid, diagnosis, procedure | Captured | Captured | Captured | No page overflow; sampled chart and toolbar inspection; clinical geometry unchanged |
| Imaging empty state, treatment report, owner report editor | Captured | Captured | Captured | Empty-state controls and owner editor inspected; removed review action/banner covered by tests |
| Practice general settings | Captured | Captured | Captured | Navigation and input visibility inspected; async name loading covered by tests |
| Treatment titles, long title, selected editor | Inspected | Inspected | Inspected | Direct opening verified; title wrapping, selected state and focus ring inspected; CSS collision fixed |
| Patient list: single/multiple visits, long names | Captured | Inspected | Captured | Row action heights 36px desktop, 44px phones; no page overflow |
| Expanded patient actions | — | — | Captured | Menu screenshot; existing table-action layout preserved |
| Empty patient search | Captured | Captured | Captured | No page overflow |
| Account menu and dialog | Inspected | Captured | Captured | Focus, disabled actions, secondary action contrast |
| Chart settings and More menu | Captured | Captured | Inspected | Menu readability, fields and primary Done action |
| Owner-report PDF preview | Captured | Captured | Inspected | Ordinary Download PDF, no draft banner/markings; spaced action buttons; no browser errors |
| Email composer and confirmation | Captured | Captured | Inspected | Recipient/attachment visible; cancellation tested; no live send |
| Native chart browser preview | Captured | Inspected | Captured | Shared token aliases preserve native palette |

Automated browser runners reported no page errors or horizontal page overflow in these states. Captured means screenshot and overflow check, not an assertion that every pixel/state was manually reviewed. Focused full-size inspections are identified above.

Regression coverage includes delayed profile-name loading, preserving user edits, typed whitespace, save behavior, guarded return to chart, title-based editor selection, export without review metadata, missing/changed attachments, cancellation and duplicate clicks, stale PDF/recipient checks, real DialogHost Escape cancellation, and the server recipient precondition.

## Remaining coverage boundaries

This is not an exhaustive full-app UI certification. Live authenticated billing/team workflows, every expanded clinical state, real device/WebKit rendering, native dark mode, and every translated layout were not visually exercised. Landing/sign-in owning styles were not changed; their shared-token effects were not separately screenshot-reviewed. Missing-image warning behavior is tested but its rendered error state was not separately captured. No live owner email/provider delivery was exercised. The server change needs deployment with the release.
