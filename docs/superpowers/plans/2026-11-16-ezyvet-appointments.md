# ezyVet Today's Patients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The side panel shows today's ezyVet patients; picking one opens ToothOps on a chart with patient, owner and patient number filled in, and Send to ezyVet matches by patient number.

**Architecture:** A new page-script module reads ezyVet's Dashboard calendar and its `/General/MouseOver` tooltip endpoint (in the ezyVet tab, world MAIN). The background worker gains panel-only `appointments` / `startChart` requests and a web-app-only `takePendingPatient` request; the hand-over is held in `chrome.storage.session` per opened tab. The web app picks it up after sign-in and reuses its own + New patient / + New visit paths.

**Tech Stack:** TypeScript, React 18, Vitest + Testing Library (jsdom), Chrome MV3 (`chrome.scripting`, `chrome.storage.session`, `chrome.tabs`), Supabase JS, i18next.

**Spec:** `docs/superpowers/specs/2026-11-16-ezyvet-appointments-design.md`

## Global Constraints

- Work in `/Users/timothyobrien/git/vibing-dental-ezyvet-appts` (branch `ezyvet-appointments`). Stage files by path, never `git add -A`.
- Before every commit: `npm test` and `npm run build` both pass (AGENTS.md).
- All user-facing text through `t()`. Add keys to `src/locales/en/<ns>.json`, write fr/de/it/es yourself (formal address: vous / Sie / Lei / usted; Italian capitalises Lei, Suo, Sua; follow `src/locales/glossary.json`; identical `{{placeholders}}`), then `npm run i18n:translate -- --rehash`.
- No new extension permissions. `manifest.json` `permissions` stay `["scripting", "sidePanel", "identity"]`, host access `https://*.ezyvet.com/*` only.
- No patient data in URLs, logs, diagnostic reports or failure payloads (codes and times only).
- Every ezyVet selector lives in `src/extension/ezyvet/selectors.ts`.
- Tooltip HTML is parsed with `DOMParser`; never inserted into the ezyVet page.
- Hand-over lifetime: 120 000 ms, one use.
- Lint rules: no literal strings to `new Error(...)` except with `// eslint-disable-next-line no-restricted-syntax -- dev-only: <reason>`; no JSX literal text.
- Every new exported `.tsx` component is imported by some `*.i18n.test.tsx` pseudo-locale test.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A tooltip that isn't `Name (Number)`** (no brackets, brackets inside the name like "Bella (Bee) (123)"): the last bracketed group is the number; with no brackets the appointment is a `tooltip_not_parsed` failure, never a patient with an empty number. → Task 1 tests.
2. **The ezyVet tab is inside a consult when the panel opens**: the automatic load must not move it (`navigate: false` → `not_on_calendar`, page untouched). → Task 1 and Task 6 tests.
3. **A second Start chart click before the first tab loads**: each tab gets its own patient. → Task 2 test.
4. **The vet cancels "discard unsaved changes"**: nothing is changed, the stashed patient is removed so a later reload doesn't fill it into some other chart. → Task 7 test.
5. **Patient numbers written differently** ("00123" vs "123", surrounding spaces): count as equal; an empty number never matches anything. → Task 4 tests.

---

### Task 1: Page script: today's appointments and the consult's patient number

**Files:**
- Create: `src/extension/ezyvet/appointments.ts`
- Create: `src/extension/ezyvet/appointments.test.ts`
- Modify: `src/extension/ezyvet/selectors.ts` (calendar selectors, added to `REPORTED_SELECTORS`)
- Modify: `src/extension/ezyvet/page.ts` (expose the two functions)
- Modify: `src/extension/ezyvet/page.test.ts`

**Interfaces:**
- Produces (in `appointments.ts`):
  ```ts
  export type Appointment = { appointmentId: string; start: string /* ISO */; patientName: string; patientNumber: string; ownerName: string; vet: string | null };
  export type AppointmentFailureCode = 'no_data_col' | 'no_appointment_id' | 'tooltip_empty' | 'tooltip_not_parsed' | 'tooltip_fetch_failed';
  export type AppointmentsResult =
    | { ok: true; appointments: Appointment[]; failures: { code: AppointmentFailureCode; startsAt: string | null }[] }
    | { ok: false; code: 'not_on_calendar' | 'no_dashboard' | 'no_date_input' | 'no_calendar_refresh' };
  export type TooltipFetch = (recordClass: 'Appointment' | 'Consult', recordId: string) => Promise<string>;
  export type PageDeps = { doc: Document; fetchTooltip: TooltipFetch; wait: (ms: number) => Promise<void> };
  export function parseTooltip(html: string): { patientName: string; patientNumber: string; ownerName: string; time: string | null } | null;
  export function listAppointments(date: string, opts: { navigate: boolean }, deps?: Partial<PageDeps>): Promise<AppointmentsResult>;
  export function consultPatientNumber(recordId: string, deps?: Partial<PageDeps>): Promise<string | null>;
  ```
- Produces (on `window.__toothopsEzyvet`): `listAppointments`, `consultPatientNumber`.
- Selectors (all `// unverified: reference`): `DASHBOARD_ACTIVE = '#rightpane .dashboard.active'`, `DASHBOARD_BUTTON = '#dashboardSectionButton'`, `CALENDAR_DATE_INPUT = '#calendarSideList [name="currentdate"]'`, `DAY_VIEW_ACTIVE = '#timespanSelector .active [data-text="Day"]'`, `DAY_VIEW_BUTTON = '#timespanSelector [data-text="Day"]'`, `APPOINTMENT_BLOCK = 'div[id^="appt"]'`, `CALENDAR_COLUMN_NAMES = 'div.sep span'`. Add all but the button selectors to `REPORTED_SELECTORS`.

- [ ] **Step 1: Write the failing tests** in `appointments.test.ts`, using a synthetic Dashboard built in `document.body` and a fake `fetchTooltip` returning HTML like `<div><label>Patient</label><span class="value">Bella (12345)</span></div><div><label>Time</label><span class="value">09:30AM</span></div><div><label>Owner</label><span class="value">Mr Smith, Jane</span></div>`; `wait` resolves immediately.
  - `parseTooltip`: `"Bella (12345)"` → `{ patientName: 'Bella', patientNumber: '12345', ownerName: 'Mr Smith, Jane', time: '09:30AM' }`; `"Bella (Bee) (123)"` → name `'Bella (Bee)'`, number `'123'`; `"Bella"` → `null`; `''` → `null`; HTML entities decoded (`Ch&eacute;ri (7)` → `'Chéri'`).
  - `listAppointments('2026-11-16', { navigate: false })` with no `.dashboard.active` → `{ ok: false, code: 'not_on_calendar' }` and `DASHBOARD_BUTTON` was not clicked.
  - `navigate: true`, no dashboard, no button → `no_dashboard`; button present → clicked, then proceeds.
  - Date input value is set to `'2026-11-16'` and `window.calendarRefresh` called once; if the input already holds that date, not called; `calendarRefresh` missing → `no_calendar_refresh`; input missing → `no_date_input`.
  - Day button clicked only when `DAY_VIEW_ACTIVE` is absent.
  - Blocks: `data-animal="0"` and missing `data-animal` are skipped (no tooltip fetch); a block with `data-record-id="55" data-appointment="900" data-animal="3" data-start="34200" data-col="2"` and columns `['Dr Ng','Dr Lee']` → `{ appointmentId: '900', patientName: 'Bella', patientNumber: '12345', ownerName: 'Mr Smith, Jane', vet: 'Dr Lee', start: new Date(2026,10,16,9,30).toISOString() }`; fetch called with `('Appointment', '55')`.
  - No blocks → `{ ok: true, appointments: [], failures: [] }`.
  - Failures: missing `data-appointment` → `no_appointment_id`; empty response → `tooltip_empty`; unparsable → `tooltip_not_parsed`; fetch throws → `tooltip_fetch_failed`; each with `startsAt` from `data-start` (or `null`), and no names anywhere in the failure object (`JSON.stringify(failure)` doesn't contain `'Bella'`).
  - At most 4 tooltip fetches in flight (count concurrent calls with 10 blocks).
  - `consultPatientNumber('4521')` calls fetch with `('Consult', '4521')`, returns `'12345'`; unparsable or throwing fetch → `null`.
  - Tooltip HTML never ends up in `document.body` (`document.body.innerHTML` unchanged by the fetch step).
- [ ] **Step 2: Run** `npx vitest run src/extension/ezyvet/appointments.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `appointments.ts`.** Default `fetchTooltip` is `fetch('/General/MouseOver', { method: 'POST', credentials: 'include', headers: { accept: '*/*', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body: new URLSearchParams({ recordClass, recordId }).toString() })` then `.text()`. Waits: navigation and block appearance poll every 100 ms up to 5000 ms; after `calendarRefresh` wait 1500 ms; after the Day click wait 500 ms. Patient regex `/^(.*\S)\s*\(([^()]*)\)\s*$/` on the trimmed `span.value` text. Label lookup: a `label` whose `textContent.trim()` starts with the word, then `span.value` in the same parent. Concurrency: a small worker pool of 4 (no new dependency). `start` = local midnight of `date` + `data-start` seconds; if `data-start` is missing use the tooltip time (`hh:mmAM`) on that date; neither → skip the time (`start` = local midnight).
- [ ] **Step 4: Expose in `page.ts`** (`listAppointments`, `consultPatientNumber` on `ToothopsEzyvet` and the installed object) and extend `page.test.ts` to assert both are functions.
- [ ] **Step 5: Run** `npx vitest run src/extension/ezyvet/`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(extension): read today's ezyVet appointments and the consult's patient number`.

### Task 2: Background worker: appointments, hand-over, consult number

**Files:**
- Modify: `src/extension/protocol.ts`, `src/extension/background.ts`, `src/extension/ezyvet/read.ts` (`Status` gains `patientNumber`)
- Test: `src/extension/background.test.ts`

**Interfaces:**
- Consumes: Task 1 types and page functions.
- Produces (in `protocol.ts`):
  ```ts
  export type Handover = { userId: string; patientName: string; patientNumber: string; ownerName: string; latestChartId: string | null };
  // Request gains:
  | { type: 'appointments'; date: string; navigate: boolean }   // panel only
  | { type: 'startChart'; handover: Handover }                  // panel only
  | { type: 'takePendingPatient' }                              // web app only
  export type AppointmentsResponse = { tab: { id: number; title: string } | null; result: AppointmentsResult | null };
  export type StartChartResult = { ok: boolean };
  export type TakePendingResult = { handover: Handover | null };
  export const HANDOVER_TTL_MS = 120_000;
  /** Where Start chart opens ToothOps: the dev origin in the unpacked dev build, else https://toothops.app. */
  export const WEB_APP_ORIGIN: string;
  ```
  `Status` (read.ts) becomes `{ state; patientName; patientNumber: string | null; consult }`; `status()` returns `patientNumber: null` (it stays synchronous).
- `Deps` gains: `page.listAppointments(tabId, date, navigate): Promise<AppointmentsResult>`, `page.consultPatientNumber(tabId, recordId): Promise<string | null>`, `openTab(url: string): Promise<number | undefined>`, `session: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>; remove(key: string): Promise<void> }`, `now(): number`. `Sender` becomes `{ origin?: string; tab?: { id?: number } }`.

- [ ] **Step 1: Write the failing tests** in `background.test.ts` (extend `makeDeps` with the new fakes; `session` backed by a `Map`):
  - `inspect` on a writable consult calls `consultPatientNumber(1, '4521')` and returns `status.patientNumber === '12345'`; if it rejects, `patientNumber` is `null` and inspect still succeeds; not called for a non-writable state.
  - `handleInternal({ type: 'appointments', date: '2026-11-16', navigate: false })` → `{ tab: { id: 1, title: 'Tab 1' }, result }` with `listAppointments` called `(1, '2026-11-16', false)`; no ezyVet tab → `{ tab: null, result: null }`; page call rejects → `{ tab, result: null }`.
  - `handleExternal` with `appointments` or `startChart` → `undefined`; `handleInternal` with `takePendingPatient` → `undefined`.
  - `startChart` → `openTab` called with `` `${WEB_APP_ORIGIN}/#/chart/patient?from=ezyvet` `` and `session` holds `pending:42` (`openTab` returned 42) `= { handover, at: now }`; returns `{ ok: true }`; `openTab` returns undefined → `{ ok: false }`, nothing stored.
  - `takePendingPatient` from sender `{ origin: 'https://toothops.app', tab: { id: 42 } }` → `{ handover }`, and a second call → `{ handover: null }` (one use).
  - Two `startChart` calls opening tabs 42 and 43: tab 43 takes the second handover, tab 42 the first.
  - Expiry: stored at `now`, taken at `now + HANDOVER_TTL_MS + 1` → `{ handover: null }` and the key is removed.
  - Sender without `tab.id` → `{ handover: null }`.
  - `installListeners` routes the new types (add to `KNOWN_TYPES`).
- [ ] **Step 2: Run** `npx vitest run src/extension/background.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Split `dispatch` into shared (`ping`, `inspect`, `send`, `diagnose`), `dispatchInternal` (+ `appointments`, `startChart`) and `dispatchExternal` (+ `takePendingPatient`, which needs `sender`). `createChromeDeps` wires `openTab` to `api.tabs.create({ url })` → `tab.id`, `session` to `api.storage.session`, `now` to `Date.now`, and the two page calls through `callWith` (multi-arg: pass an object arg). Keep `refusal()` unchanged (it ignores `patientNumber`). `WEB_APP_ORIGIN = DEV_ORIGIN ?? 'https://toothops.app'`.
- [ ] **Step 4: Run** `npx vitest run src/extension/`. Expected: PASS (fix fixtures in other extension tests that build a `Status` without `patientNumber`).
- [ ] **Step 5: Commit** `feat(extension): appointments and hand-over requests in the background worker`.

### Task 3: Transport methods

**Files:**
- Modify: `src/utils/pims/extensionBridge.ts`
- Test: `src/utils/pims/extensionBridge.test.ts`

**Interfaces:**
- Consumes: Task 2 protocol types.
- Produces on `PimsTransport`: `appointments(date: string, navigate: boolean): Promise<AppointmentsResponse>` (timeout 30 000 ms), `startChart(handover: Handover): Promise<StartChartResult>` (5 000 ms), `takePendingPatient(): Promise<TakePendingResult | null>` (tries 1 500 ms then 3 000 ms like `ping`; `null` when the extension doesn't answer or doesn't know the request). Exported top-level `takePendingPatient` from `externalTransport`.

- [ ] **Step 1: Failing tests:** each method sends the exact request object; `takePendingPatient` returns `null` when the channel reports `lastError` twice, and the result when the second attempt answers; `appointments` maps a timeout to the existing `pims:errors.timeout` `LocalizedError`.
- [ ] **Step 2: Run** `npx vitest run src/utils/pims/extensionBridge.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `createTransport`. Update the test fakes implementing `PimsTransport` elsewhere (`grep -rn "diagnose: async" src`) with the three methods.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(pims): transport methods for appointments and hand-over`.

### Task 4: Matching by patient number

**Files:**
- Modify: `src/utils/pims/patientMatch.ts` (+ test `patientMatch.test.ts`)
- Modify: `src/hooks/usePimsSend.ts` (+ its test), `src/components/SendToEzyvetDialog.tsx`, `src/extension/sidepanel/ChartSend.tsx`, `src/extension/sidepanel/ChartList.tsx` (+ `ChartList.test.tsx`)
- Modify: `src/locales/{en,fr,de,it,es}/pims.json` (`mismatch.messageNumbers`)

**Interfaces:**
- Produces:
  ```ts
  export function samePatientNumber(a: string | null | undefined, b: string | null | undefined): boolean | null; // null = either empty
  export function pimsPatientMatch(
    chart: { name: string; number: string },
    ezyvet: { name: string | null; number: string | null },
    nameRule: (chartName: string, ezyvetName: string | null) => boolean,
  ): 'same' | 'different';
  ```
- `UsePimsSendOptions` gains `patientNumber: string` (the chart's). The `patientMatcher` option keeps its name-only signature and is passed as `nameRule`.
- New key `pims:mismatch.messageNumbers`: "The chart is for {{chart}} (number {{chartNumber}}), but ezyVet shows {{ezyvet}} (number {{ezyvetNumber}})." Used when both numbers are known and differ; otherwise the existing `mismatch.message`.

- [ ] **Step 1: Failing tests:**
  - `samePatientNumber('00123', ' 123 ')` → `true`; `('123', '124')` → `false`; `('', '123')`, `(null, '1')` → `null`; `('0', '000')` → `true`; non-digits compared case-insensitively after trim (`'AB12'` vs `'ab12'` → `true`).
  - `pimsPatientMatch`: numbers equal with different names → `'same'`; numbers differ with equal names → `'different'`; a number missing → `nameRule` decides.
  - `usePimsSend`: numbers equal and names differ → sends without the mismatch dialog; numbers differ → dialog with `messageNumbers`.
  - `consultMatches`: a chart with `patient_number` equal to `info.status.patientNumber` is in `exact` even when names differ; a chart whose number differs is in neither list even if names match strictly.
- [ ] **Step 2: Run** `npx vitest run src/utils/pims src/hooks/usePimsSend src/extension/sidepanel/ChartList`. Expected: FAIL.
- [ ] **Step 3: Implement.** Leading zeros: strip `^0+` from all-digit values (keep `'0'`). `SendToEzyvetDialog` and `ChartSend` pass the chart's patient number (`patientInfo.patientNumber` / `chart.patient_number`).
- [ ] **Step 4: Translate** `mismatch.messageNumbers` into fr/de/it/es, run `npm run i18n:translate -- --rehash`.
- [ ] **Step 5: Run** `npm test`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(pims): match the ezyVet patient by patient number when both are known`.

### Task 5: Charts for today's appointments

**Files:**
- Modify: `src/utils/chartQueries.ts`
- Create: `src/utils/pims/appointmentCharts.ts` (+ `appointmentCharts.test.ts`)

**Interfaces:**
- Produces:
  ```ts
  // chartQueries.ts
  export async function chartsForPatients(patients: { patientNumber: string; patientName: string }[]): Promise<CloudChartMeta[]>;
  // appointmentCharts.ts
  export type AppointmentAction = { kind: 'open'; chart: CloudChartMeta } | { kind: 'newVisit'; latest: CloudChartMeta } | { kind: 'start' };
  export function appointmentAction(appt: Pick<Appointment, 'patientName' | 'patientNumber' | 'ownerName'>, charts: CloudChartMeta[], today: string /* yyyy-MM-dd */): AppointmentAction;
  ```
- `chartsForPatients`: `CHART_META_COLUMNS`, chunks of 80 like `visitsOfPatients`; `.in('patient_number', nums)` plus `.ilike('patient_name', escapeLike(name))` per distinct name (exact, case-insensitive), `.range(0, 999)`; throws `LocalizedError` via the module's existing error helper on failure.
- `appointmentAction` belongs-to rule: `samePatientNumber(chart.patient_number, appt.patientNumber) === true`; or, when that is `null`, `normaliseName(chart.patient_name) === normaliseName(appt.patientName)` and the chart has an owner whose `ownerSurname` equals `ownerSurname(appt.ownerName)`. A number that differs never matches by name. Among matches: `chart_date === today` → `open` (most recently updated); else `newVisit` with the latest `chart_date` (ties: latest `updated_at`); none → `start`.

- [ ] **Step 1: Failing tests** for `appointmentAction`: number match today → `open`; older only → `newVisit` with latest; same name and surname, chart without number → match; same name, chart without owner → `start`; same name but different number → `start`; owner "Mr Smith, Jane" vs chart owner "Jane Smith" → match.
- [ ] **Step 2: Run** `npx vitest run src/utils/pims/appointmentCharts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both functions.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(pims): find each appointment's existing charts`.

### Task 6: Side panel "Today's patients"

**Files:**
- Create: `src/extension/sidepanel/TodaysPatients.tsx`, `src/extension/sidepanel/useTodaysAppointments.ts`
- Create: `src/extension/sidepanel/TodaysPatients.test.tsx`
- Modify: `src/extension/sidepanel/SidePanelApp.tsx` (render above `ChartList` when no chart is picked), `src/extension/sidepanel/sidepanel.i18n.test.tsx` (import and pseudo-check `TodaysPatients`), sidepanel CSS file used by `ChartList` (row styles)
- Modify: `src/locales/{en,fr,de,it,es}/pims.json` (`panel.today.*`)

**Interfaces:**
- Consumes: `internalTransport.appointments`, `internalTransport.startChart` (Task 3), `chartsForPatients` / `appointmentAction` (Task 5), `localDateISO` (`src/utils/localDate`), `WEB_APP_ORIGIN` (Task 2).
- Produces:
  ```ts
  export type TodayState =
    | { kind: 'loading' } | { kind: 'noTab' } | { kind: 'notOnCalendar' }
    | { kind: 'error'; code: string } | { kind: 'ready'; date: string; rows: { appt: Appointment; action: AppointmentAction }[]; failed: number };
  export function useTodaysAppointments(userId: string): { state: TodayState; refresh(navigate: boolean): void; navigated: boolean };
  export const TodaysPatients: React.FC<{ userId: string }>;
  ```
- en copy (keys under `panel.today`): `title` "Today's patients (ezyVet)", `refresh` "Refresh", `load` "Load today's patients", `loadHint` "This switches your ezyVet tab to the calendar.", `noTab` "Open ezyVet to see today's patients.", `empty` "No patients on today's ezyVet schedule.", `failed_one` / `_other` (+ `_many` fr/it/es) "{{count}} appointment couldn't be read." / "{{count}} appointments couldn't be read.", `start` "Start chart", `open` "Open chart", `newVisit` "New visit", `startAnyway` "Start new chart", `loading` "Loading today's patients…", `errors.no_dashboard` "Couldn't find ezyVet's Dashboard.", `errors.no_date_input` "Couldn't set the date on ezyVet's calendar.", `errors.no_calendar_refresh` "ezyVet's calendar didn't respond. Reload ezyVet and try again.", `errors.unknown` "Couldn't read today's ezyVet schedule.", `startFailed` "Couldn't open ToothOps. Try again."

- [ ] **Step 1: Failing tests** (`TodaysPatients.test.tsx`, transport and `chartsForPatients` mocked):
  - On mount calls `appointments(today, false)`; `result.ok === false, code 'not_on_calendar'` → shows `load` button and `loadHint`; clicking it calls `appointments(today, true)`; after that, Refresh also passes `true`.
  - `{ tab: null }` → `noTab`; `ok: true, appointments: []` → `empty`; `failures.length === 2` → "2 appointments couldn't be read."
  - Rows sorted by `start`, showing time (locale short time), patient, owner, vet.
  - Action `start` → **Start chart** calls `startChart({ userId, patientName, patientNumber, ownerName, latestChartId: null })`; `newVisit` → **New visit** with `latestChartId` = latest id; `open` → **Open chart** calls `chrome.tabs.create({ url: `${WEB_APP_ORIGIN}/#/chart/<id>` })` and **Start new chart** calls `startChart` with `latestChartId: null`.
  - `startChart` → `{ ok: false }` shows `startFailed`.
  - A `chartsForPatients` failure still lists the patients, every row with **Start chart**.
  - Window focus on a new day (mock `localDateISO`) refetches.
- [ ] **Step 2: Run** `npx vitest run src/extension/sidepanel/TodaysPatients.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the hook (newest request wins, as in `useConsultInspect`) and component; wire into `SidePanelApp`; add the pseudo-locale check.
- [ ] **Step 4: Translate** the `panel.today` keys (fr/it/es `_many`), `npm run i18n:translate -- --rehash`.
- [ ] **Step 5: Run** `npm test`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(extension): today's ezyVet patients in the side panel`.

### Task 7: Web app picks up the hand-over

**Files:**
- Create: `src/utils/pims/ezyvetHandover.ts` (+ `ezyvetHandover.test.ts`)
- Create: `src/hooks/useEzyvetHandover.ts` (+ `useEzyvetHandover.test.tsx`)
- Modify: `src/index.tsx` (call `captureFromEzyvet()` before render), `src/EntryGrid.tsx` (call the hook, non-trial only)
- Modify: `src/locales/{en,fr,de,it,es}/pims.json` (`handover.*`)

**Interfaces:**
- Consumes: `takePendingPatient` (Task 3), `Handover` (Task 2), EntryGrid's `startNewPatient(): Promise<boolean>`, `startVisitFromChart(id): Promise<boolean>`, `chart.setPatientInfo`.
- Produces:
  ```ts
  // ezyvetHandover.ts
  export const FROM_EZYVET_KEY = 'toothops.fromEzyvet';
  export const STASHED_PATIENT_KEY = 'toothops.ezyvetPatient';
  /** Strips `?from=ezyvet` from the hash (replaceState) and remembers it for this tab. */
  export function captureFromEzyvet(loc?: Location, storage?: Storage, history?: History): void;
  export function consumeFromEzyvet(storage?: Storage): boolean;
  export function stashPatient(p: Pick<Handover, 'patientName' | 'patientNumber' | 'ownerName'>, storage?: Storage): void;
  export function takeStashedPatient(storage?: Storage): Pick<Handover, 'patientName' | 'patientNumber' | 'ownerName'> | null;
  // useEzyvetHandover.ts
  export function useEzyvetHandover(opts: {
    enabled: boolean;
    getUserId: () => Promise<string | null>;
    take: () => Promise<TakePendingResult | null>;
    startNewPatient: () => Promise<boolean>;
    startVisitFromChart: (chartId: string) => Promise<boolean>;
    fillPatient: (p: Pick<Handover, 'patientName' | 'patientNumber' | 'ownerName'>) => void;
  }): void;
  ```
- Flow on mount (once, when `enabled`): stashed patient present → `fillPatient`, toast `handover.filled`, done. Else if `consumeFromEzyvet()`: `take()`; `null`/no handover → toast `handover.failed`; `handover.userId !== await getUserId()` → toast `handover.otherUser`; `latestChartId` → `startVisitFromChart(id)` (toast `handover.filled` on true); else `stashPatient` then `startNewPatient()`; on `false` remove the stash (`takeStashedPatient`) and do nothing more (the reload on `true` re-runs the hook, which fills from the stash).
- en copy: `handover.filled` "Patient details filled in from ezyVet.", `handover.failed` "Couldn't get the patient from ezyVet. Fill in the details.", `handover.otherUser` "This patient was picked in the extension as another user. Sign in with the same account in both."

- [ ] **Step 1: Failing tests:**
  - `captureFromEzyvet` with hash `#/chart/patient?from=ezyvet` → hash becomes `#/chart/patient`, `consumeFromEzyvet()` → `true` once, then `false`; other hashes untouched.
  - Hook: stash present → `fillPatient` with it, `take` not called; flag + handover without `latestChartId` → `stashPatient` then `startNewPatient`; `startNewPatient` resolves `false` → stash removed, `fillPatient` not called; `latestChartId: 'c9'` → `startVisitFromChart('c9')`; other user → `otherUser` toast, nothing started; `take` → `null` → `failed` toast; `enabled: false` → nothing.
- [ ] **Step 2: Run** `npx vitest run src/utils/pims/ezyvetHandover.test.ts src/hooks/useEzyvetHandover.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement**; in EntryGrid pass `enabled: !trial && cloud.enabled`, `getUserId` via `supabase.auth.getSession()`, `fillPatient` = `chart.setPatientInfo(prev => ({ ...prev, patientName, ownerName, patientNumber }))`.
- [ ] **Step 4: Translate** `handover.*`, `npm run i18n:translate -- --rehash`.
- [ ] **Step 5: Run** `npm test`. Expected: PASS.
- [ ] **Step 6: Commit** `feat: start a ToothOps chart from an ezyVet appointment picked in the extension`.

### Task 8: Checklist, full verification

**Files:**
- Modify: `src/extension/README.md` (new "Today's patients" section and checklist items from spec §6)

- [ ] **Step 1: Update the README:** a short "Today's patients" section (what loads when, the hand-over, no new permissions), and the checklist items listed in spec §6, including "the bracketed tooltip number equals the patient number ezyVet shows on the patient record" marked high risk.
- [ ] **Step 2: Run** `npm test && npm run build && npm run build:extension`. Expected: all pass; `build-extension/manifest.json` permissions unchanged.
- [ ] **Step 3: Run** `npm run i18n:translate -- --check`. Expected: `todo=0 remove=0`.
- [ ] **Step 4: Commit** the README and the spec/plan docs: `docs: ezyVet today's patients design, plan and checklist`.
