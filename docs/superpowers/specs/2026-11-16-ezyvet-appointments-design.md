# ToothOps extension: start charts from ezyVet appointments

## Why

Vets retype each patient's name, owner and number into ToothOps, then later send the record note back to ezyVet, where the extension has to guess from names whether the open consult is the right patient. This project removes both problems:

1. **Less retyping.** The side panel shows today's patients from the ezyVet schedule. Picking one opens ToothOps on a new chart with the patient, owner and patient number already filled in.
2. **Reliable matching.** The chart now carries ezyVet's patient number, so **Send to ezyVet** can compare numbers instead of names.

Practices moving from ScribbleVet also expect an appointment list; it pulls appointments the same way.

Success: a vet opens the panel, sees today's patients from ezyVet at the top, picks one, charts it in ToothOps without typing patient details, and the send later lands in that patient's consult without a "Different patient?" question.

## How ScribbleVet does it (reference)

Studied from its shipped extension (v1.31.3, `ezyvet.js` module `contents/ezyVet/listVisits`, side panel `pims/ezyvet/pull-button`). We copy the approach, not code.

There is no ezyVet API. Code runs in the vet's logged-in ezyVet tab (`chrome.scripting.executeScript`, `world: "MAIN"`):

1. **Dashboard.** Refuses unless `#rightpane .dashboard.active` is present. (Its provider list opens it by clicking `#dashboardSectionButton` and waiting for `#calendarSideList [name="currentdate"]`.)
2. **Day view and date.** If `#timespanSelector .active [data-text="Day"]` is absent it clicks `#timespanSelector [data-text="Day"]` and waits for the Week button to lose `.active`. It writes `yyyy-MM-dd` into `#calendarSideList [name="currentdate"]`, calls the page's `window.calendarRefresh()` and waits 1.5 s.
3. **Appointment blocks.** Waits up to 5 s for `div[id^="appt"]`. Each block's dataset: `recordId`, `appointment`, `animal` (`"0"` or missing = no patient, skipped), `start` (seconds after midnight), `col` (1-based provider column). Column names are `div.sep span` in order.
4. **Details.** Per block: `fetch('/General/MouseOver', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body: 'recordClass=Appointment&recordId=<recordId>' })`. The response is HTML: `label` elements whose text starts with `Patient`, `Time`, `Owner`, each followed (in the same parent) by `span.value`. `Patient` reads `Name (Number)`; `Time` reads like `09:30AM`; `Owner` like `Mr Smith, Jane` or `Smith, Jane`.
5. **Result.** `{ patient: { name: "Bella Smith", id: "12345" }, provider, visit: { id, date } }`, where the owner surname (title dropped, text before the comma) is appended to the patient name. Failures per block are reported with codes (`no_data_col`, `no_appointment_id`, `popup_empty`, `popup_not_parsed`, `error_fetching_visit`).

It never reads the patient of the open consult.

## Goals

1. **Today's patients** at the top of the side panel, above the charts list: today's ezyVet schedule in time order (time, patient, owner, vet).
2. Loaded by itself when the panel opens and the ezyVet tab is already on the calendar; otherwise one press of **Load today's patients** (because loading moves the ezyVet tab to the calendar).
3. **Start chart** on an appointment opens a new ToothOps tab on a new chart with patient name, owner name and patient number filled in.
4. Each patient row offers the right action: **Open chart** when the patient already has a chart dated today; **New visit** when they only have earlier charts (carries their details and missing/extracted teeth over, as the web app's + New visit does); **Start chart** when they have none.
5. **Send to ezyVet** (web dialog and panel) compares patient numbers when both are known.

## Non-goals

- Writing anything to ezyVet's calendar or appointments.
- Background syncing, or moving the ezyVet tab without the vet asking. Loading by itself only happens when the tab is already on the calendar.
- Other days than today.
- Other PIMS.
- Storing appointments on our servers. The list lives in the panel only.
- Species, breed, reason for visit (could come later from the same tooltip).

## Anti-goals

- Patient details in a URL, the browser history or logs.
- Leaving the vet's ezyVet tab somewhere surprising without saying so.
- A number mismatch that silently blocks or silently sends: it always asks.

## Constraints

- ezyVet markup and `/General/MouseOver` are undocumented and unverified by us; there are no live tests. Every selector goes in `src/extension/ezyvet/selectors.ts` and the diagnostic report gains their hit counts.
- One new extension permission: `storage`, for `chrome.storage.session` (the in-memory hand-over; Chrome shows no install warning for it). `scripting`, `sidePanel`, `identity` and `https://*.ezyvet.com/*` stay. Opening a tab with `chrome.tabs.create` needs none.
- All text through `t()` with fr/de/it/es translations (AGENTS.md); new panel screens get pseudo-locale tests.
- English chart behaviour otherwise unchanged.

## Approaches considered

**Reading appointments**
- *Dashboard calendar + tooltip endpoint (chosen).* Works with the vet's own session, proven by ScribbleVet. Costs: moves the ezyVet tab to the Dashboard, depends on undocumented HTML.
- *ezyVet official API.* Needs partner credentials per practice. Ruled out.

**Handing the patient to the web app**
- *Through the extension (chosen by the owner).* No patient data in URLs; reuses the existing web app ↔ extension channel; no new permissions.
- *In the link (`#/chart/new?patient=…`).* Simpler, but names land in history and anyone can craft such a link. Rejected.

**Where the ezyVet number lives**
- *Existing patient number (chosen by the owner).* No migration. ezyVet practices most likely use ezyVet's number as their patient number. Risk: if the bracketed number is ezyVet's internal id instead, numbers won't match the ones vets type; the mismatch only asks, never blocks (checklist item verifies).
- *New `pims_patient_id` column.* Cleaner separation; more work. Not chosen.

Owner decision (2026-11-16): ship number filling and number matching as designed, with no switch. Release already waits on the real-ezyVet checklist, which includes confirming the bracketed number is the patient number vets see.

## Design

### 1. Page side (`src/extension/ezyvet/appointments.ts`, new)

Exposed on `window.__toothopsEzyvet` as `listAppointments(date: string, opts: { navigate: boolean })` (`yyyy-MM-dd`, the panel always passes today).

1. With `navigate: false`, read only when the Dashboard is active, the date input already shows `date` and Day view is active; otherwise → `{ ok: false, code: 'not_on_calendar' }` without touching the page (no date change, no `calendarRefresh`, no Day click). With `navigate: true`, if the Dashboard isn't active, click `#dashboardSectionButton` and wait (5 s) for the date input. Missing button → `{ ok: false, code: 'no_dashboard' }`.
2. Day view and date as in the reference. Missing date input → `no_date_input`. Use ezyVet's `calendarRefresh` only if it's a function; else `no_calendar_refresh`.
3. Wait (5 s) for `div[id^="appt"]`. None → `{ ok: true, appointments: [], failures: [] }` (an empty day is not an error).
4. For blocks with a patient, fetch the tooltip, at most 4 at a time. Parse the HTML with `DOMParser` (never insert it into the page).
5. Return `{ ok: true, appointments: Appointment[], failures: { code, startsAt? }[] }`, where
   `Appointment = { appointmentId, start /* ISO */, patientName, patientNumber, ownerName, vet | null }`.
   `patientName` is the bare name; owner surname is not appended (ToothOps keeps owner separately).
   `start` comes from `data-start` and the requested date; the tooltip's `Time` is a fallback.

Failures never include names (the codes and times only).

### 2. Background (`background.ts`, `protocol.ts`)

New requests. `dispatch` is split so panel-only and web-app-only requests are refused from the other side.



- `{ type: 'appointments'; date: string; navigate: boolean }` → `{ tab: { id, title } | null; result: AppointmentsResult | null }`. Picks the ezyVet tab like `inspect` (`pickEzyvetTab`). **Side panel only**: refused from the web app (`handleExternal`), since only the panel shows it.
- `{ type: 'startChart'; patient: { patientName, patientNumber, ownerName }; latestChartId: string | null; userId: string }` (panel only): opens the tab, then stores the hand-over in `chrome.storage.session` keyed by the new tab's id (`pending:<tabId>`) with a timestamp, so two quick clicks can't swap patients. Tab: `chrome.tabs.create({ url: WEB_ORIGIN + '/#/chart/patient?from=ezyvet' })`. The URL carries no patient data.
- `{ type: 'takePendingPatient' }` (web app only, allowed origins): returns the hand-over stored for the sender's tab (`sender.tab.id`) if it is under 2 minutes old and deletes it either way (one use). Otherwise `null`. The hand-over is also cleared when its tab closes, swept when expired (on the next Start chart / take), and always gone when the browser closes (session storage).

`ping` keeps its shape. An older extension answers `takePendingPatient` with an error, which the web app treats like an expired hand-over (no version check needed).

### 3. Web app

The unsaved working chart lives in **localStorage, shared by all ToothOps tabs** (`useChartState.ts`), so the new tab is not a clean slate: the vet usually still has yesterday's or the previous patient's chart open.

- On load, if the hash route has `from=ezyvet` (parsed in `useHashRoute`; the param is removed with `history.replaceState` once handled), wait until the web app is signed in (the hand-over waits through sign-in; it is not fetched while signed out), then call `takePendingPatient`.
- The hand-over carries the panel's user id. If the web app is signed in as someone else, nothing is filled in: toast "This patient was picked in the extension as another user. Sign in with the same account in both." *(Builder-check call: refuse a mismatch rather than save into another account.)*
- A patient arrives:
  - **New chart**: exactly the web app's **+ New patient** path (`startNewPatient`: `confirmDiscardIfDirty('newPatient')` asks only when something would be lost, then a fresh chart), then set `patientName`, `ownerName`, `patientNumber`. The pending details survive the reload `resetChart` does by being re-read from `sessionStorage` (written just before the reload, cleared after use). Other open ToothOps tabs follow the shared chart as they do today for + New patient. *(Builder-check call.)*
  - **New visit** for a returning patient: the hand-over carries the latest chart id; the web app runs `startVisitFromChart(latestId)` (same as + New visit).
  - **Open chart**: plain `#/chart/<id>`; no hand-over.
  - Toast: "Patient details filled in from ezyVet."
- Vet cancels the discard question, the hand-over expired, or the extension is missing/too old: nothing changes; toast "Couldn't get the patient from ezyVet. Fill in the details." where applicable.
- Autosave then creates the chart as today (it waits for a patient name).

### 4. Side panel

The signed-in panel gets a **Today's patients** block above the existing charts list (the charts list is unchanged below it).

```
 Today's patients (ezyVet)                 ↻
 ─────────────────────────────────────────
 09:00  Bella · Smith, Jane · Dr Lee     [Open chart]
                                          Start new chart
 09:30  Max · Jones, Tom · Dr Lee        [Start chart]
 2 appointments couldn't be read.
 ─────────────────────────────────────────
 Recent charts
 …
```

- On open (and on ↻): ask the background with `navigate: false`. If the tab is on the calendar, the list fills in by itself.
- `not_on_calendar`: the block shows **Load today's patients** with the line "This switches your ezyVet tab to the calendar." Pressing it asks with `navigate: true`. After that, ↻ also navigates.
- No ezyVet tab: "Open ezyVet to see today's patients." No patients today: "No patients on today's ezyVet schedule."
- Other codes map to messages (no dashboard, no date input, ezyVet not responding).
- The list is kept in memory only, and replaced when the date rolls over (checked on refresh and focus).
- **Which action.** After the schedule loads, the panel runs its own lookup of the practice's charts for those patients (patient number equal, else `patientsMatchStrict` on name and owner; reuse the shape of `visitsOfPatients` in `src/utils/chartQueries.ts`), not the 20 recent charts. Chart dated today → **Open chart** (`WEB_ORIGIN/#/chart/<id>` in a new tab); only older charts → **New visit** from the latest; none → **Start chart**. *(Builder-check call.)*
- While a chart is open for sending (ChartSend), the block is hidden as the charts list is today.

### 5. Matching on send

`Status` gains `patientNumber: string | null`, read with the tooltip endpoint for the open consult: `recordClass=Consult&recordId=<consult recordId>`, `Patient` label, number in brackets. Unverified: if it reads nothing, `patientNumber` is null.

A new pure function `pimsPatientMatch(chart, status)` in `src/utils/pims/patientMatch.ts`:
- both numbers non-empty → `'same'` if equal (trimmed, leading zeros ignored), else `'different'`;
- otherwise the existing name rules (strict in the panel, whole-word in the web dialog).

`'different'` asks "Different patient?" (existing dialog), now naming both numbers. The background's write-time re-check is unchanged (consult id + name).

### 6. Diagnostics and checklist

- `diagnostics().selectorHits` adds the calendar selectors; the panel's **Copy diagnostic report** for appointments includes failure codes and counts only.
  - *As built:* the panel's per-appointments **Copy diagnostic report** is deferred (not built). The calendar selector hit counts are in the existing diagnostic report; the panel shows the count of unreadable appointments.
- README checklist adds: list fills in by itself when ezyVet is on the calendar; Load button moves the tab and loads; empty day; appointment without a patient skipped; ezyVet tab ends on the calendar; Start chart fills the three fields; expired hand-over (wait 2 minutes) shows the fallback toast; Open chart for an existing chart; **the bracketed tooltip number equals the patient number ezyVet shows on the patient record**; consult number read on send.

## Left to the builder

- Component split inside the panel; reuse `ChartList` row styling.
- Exact message wording (en) and translations.
- Test fixtures: synthetic calendar and tooltip HTML built from the reference selectors.
- Concurrency limit and timeouts within the ranges above.
