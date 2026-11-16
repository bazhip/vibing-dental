# ToothOps for ezyVet (Chrome extension)

Writes ToothOps record notes into the open ezyVet consult. The web app sends messages with
`chrome.runtime.sendMessage(EXTENSION_ID, …)` (`src/utils/pims/extensionBridge.ts`); the
worker receives them on `chrome.runtime.onMessageExternal` (types in `protocol.ts`), injects
`ezyvet-page.js` into the ezyVet tab and calls `window.__toothopsEzyvet`.

Permissions: `scripting`, `sidePanel`, `identity`, `storage` and host access to `https://*.ezyvet.com/*` only.

## Build and load

```
npm run build:extension      # dev build: writes build-extension/ (git-ignored)
```

The dev build also accepts messages from `http://localhost:5173` (manifest
`externally_connectable` and `ALLOWED_ORIGINS` in `protocol.ts`). The store build
(`npm run package:extension`, below) sets `VITE_PIMS_STORE_BUILD=1`, which leaves the
localhost origin out of both, so the published extension answers `https://toothops.app` only.

1. Open `chrome://extensions`, switch on Developer mode, choose Load unpacked, pick `build-extension/`.
2. The id shown must equal `DEV_EXTENSION_ID` in `src/extension/extensionId.ts`.
3. Run the web app on `http://localhost:5173` (or production) and use Send to ezyVet.

PR previews cannot reach the extension: `externally_connectable` needs exact hosts.

The Send to ezyVet button only shows when Chrome exposes `chrome.runtime.sendMessage` to the
page, which it does only when an installed extension lists the site in `externally_connectable`.
So a vet without the extension never sees the button, and the dialog's "not responding"
explainer is reached only when the extension is installed but doesn't answer (disabled,
crashed, or a cold service worker slower than the 500 ms + 1.5 s pings).
The build stamps `package.json` `version` into the manifest and into the code
(`VITE_EXTENSION_VERSION`, see `src/extension/version.ts`).

Name and description come from `src/locales/<lng>/pims.json` (`extension.name`,
`extension.description`), generated into `_locales/<lng>/messages.json`.

## Side panel

Click the ToothOps toolbar icon to open the side panel (`src/extension/sidepanel/`). It lists the
vet's recent charts and sends a chart's record note and chart picture to the open consult with the
same mapping editor and send flow as the web dialog. It is read-only: edit charts in ToothOps.

- **Pinned match.** Because the panel proposes a chart itself, it uses a stricter patient rule than the
  web dialog (`patientsMatchStrict` in `src/utils/pims/patientMatch.ts`): the names are equal once
  normalised, or the chart's patient name plus the owner's surname (title dropped; "Smith, Jane" or the
  last word) has exactly the ezyVet name's words. Such a chart is pinned under "Matches this consult".
  A chart that only shares whole words with the ezyVet name (a one-word "Bella" against "Bella Jones")
  is shown as a possible match next to the ezyVet name, with no pin. Both are chosen among the charts
  already loaded, not the whole account.
- **Patient check.** The panel's Send asks "Different patient?" unless the strict rule matches, so a
  possible match always asks. The web dialog keeps the §6 whole-word rule.
- **Practice flag.** Send follows the same rule as the web app (`FREE_BETA || practices.pims_send_enabled`,
  `src/utils/pims/sendFlag.ts`). When it is off, the chart view says sending isn't turned on for the
  practice and has no Send. If the flag can't be read, sending stays off and the view offers Retry.
- **Already sent.** The panel remembers, per account and chart, when it sent (or may have sent) a chart
  in this session, in `sessionStorage` so a panel reload keeps it. A send that never reached
  `pims_sent_at` (lost mid-send, only "may have saved" failures, or the stamp failed) therefore still
  asks first after Back and re-picking the chart. Sign-out or another account clears it.
- **Stale note.** When the stored note was edited before the chart last changed, the chart view shows
  the same notice as the Record note panel (`media:recordNote.stale`). The note is still sent as stored;
  rebuild it in ToothOps to include the changes.

Sign-in methods: email and password, Google, and Apple. The Apple button follows the same flag as the
website's (`VITE_APPLE_SIGNIN_WEB=true`); the native-app case in the web app doesn't apply here. OAuth
runs through `chrome.identity.launchWebAuthFlow` with the redirect URL
`chrome.identity.getRedirectURL('auth')`. The session lives in the extension page's own `localStorage`
(PKCE client), separate from the toothops.app session.

Sign-out is local: it removes the panel's session (and its open chart and sent-date memory) from this
browser only. It does not sign out the web app, and the refresh token is not revoked on the server
(`signOut({ scope: 'local' })`). Sign out is disabled while a send is running.

Both surfaces re-inspect the consult when Send is pressed. If the consult was switched inside ezyVet
since the last check, the new target is shown with a notice saying the consult changed, and nothing is
sent. While open, the panel also re-inspects (debounced 300 ms, keeping mapping choices) when it
regains focus or becomes visible, when the active tab changes, and when the ezyVet tab it last
inspected (or a tab Chrome reports as an ezyVet page) finishes loading. A refresh that shows the
consult seen at load again clears the notice.

### Today's patients

With the panel signed in, a Today's patients block sits above the charts list. It reads the ezyVet
calendar (`ezyvet/appointments.ts`) and each appointment's tooltip for the patient name, patient
number, owner and vet. If the ezyVet tab is already on the calendar the list fills in by itself;
otherwise (another section, another date, or Week view) the panel leaves the tab alone and the
Load button switches it to today's Day view first. An appointment drawn as more than one block is
listed once. Each row offers Open chart,
New visit or Start chart, depending on the practice's charts for that patient.

A block without a vet column keeps the patient with no vet. A block without a record id counts as
unreadable and is reported in the failure line.

Not built (deferred from the spec): a separate Copy diagnostic report for appointments. The
calendar selector hit counts are in the existing diagnostic report.

Start chart opens `https://toothops.app/#/chart/patient?from=ezyvet`. The URL carries no patient
data. The worker keeps the details in `chrome.storage.session` (in memory; the `storage` permission
shows no install warning), keyed by the new tab. The web app asks for them once with
`takePendingPatient`: they are returned only within 2 minutes, and cleared once used, when the tab
closes, or on the next Start chart or take. They are always gone when the browser closes. The web app
fills the patient details only after the discard question is confirmed, only into a blank chart, and
only when signed in as the same account as the panel.

### Owner setup for panel sign-in

1. Supabase, Authentication, URL Configuration, Redirect URLs: add both
   - `https://mkbapeaolbnpalaibokekppiciejijim.chromiumapp.org/auth` (dev extension id), and
   - `https://<store extension id>.chromiumapp.org/auth` (once the store item exists).
2. Google: nothing new in Google Cloud (Supabase is the OAuth client).
3. Apple: configure the Supabase Apple provider for web, and build with `VITE_APPLE_SIGNIN_WEB=true`.

## Signing key and extension id

The manifest `key` fixes the id across machines. The development key pair lives in
`extension-key.pem` at the repo root. It is git-ignored: never commit it.

```
openssl genrsa 2048 > extension-key.pem
node scripts/extension-id.mjs            # prints the id and the base64 DER public key
```

Put the printed `key` into `src/extension/manifest.json` and the `id` into
`src/extension/extensionId.ts` (`DEV_EXTENSION_ID`). The id is the first 32 hex
characters of sha256(public key DER), with each hex digit 0-f mapped to a-p.
A test checks that the manifest key and `DEV_EXTENSION_ID` agree.

When the Chrome Web Store item exists, replace `key` with the store's key and update
`DEV_EXTENSION_ID` (and the web app's `VITE_EXTENSION_ID`).

## Publishing

Listing text, permission justifications, privacy answers and the screenshot shot list are in [docs/chrome-web-store-listing.md](../../docs/chrome-web-store-listing.md).

1. Register a Chrome Web Store developer account (one-time fee) at https://chrome.google.com/webstore/devconsole.
2. Run `npm run package:extension`. It makes a store build in a temporary folder (no localhost origin in the manifest or the code; the script fails if `localhost` appears) and writes `build-extension.zip` with the manifest `key` removed (the store rejects `key`). The unpacked `build-extension/` keeps both for local dev.
3. Upload the zip as a new item.
4. Set visibility to Unlisted.
5. Fill in the listing, Privacy practices and screenshots from the doc, and append the extension section to the privacy policy (`public/privacy.html`) first.
6. After approval, copy the store's public key (item Package tab) into `key` in `manifest.json`, update `DEV_EXTENSION_ID`, and set `VITE_EXTENSION_ID` on Vercel to the store item id.
7. Send the store URL so the in-app install link can be switched on.

## Manual checklist on real ezyVet

jsdom cannot prove that ezyVet saved. During the free beta the Send to ezyVet button is on for
every practice (`FREE_BETA || practices.pims_send_enabled`, owner decision), so the writable-consult
check, the patient and consult check and the diagnostic report are what protect vets until this
checklist has passed on a real consult. The page fixtures are synthetic (built from reference
selectors), so every selector is unverified.

Use a test patient. For each step note pass/fail, and attach Copy diagnostic report on a failure.

Check these first (highest risk):

- [ ] Patient name selector: Inspect reads the consult's patient name (`PATIENT_NAME` in `ezyvet/selectors.ts` is a guess). If it reads nothing, the dialog always asks Send anyway, and the consult id (view id + record id) alone guards against writing to another consult.
- [ ] Note writes report success without confirming that ezyVet saved: after every send, reload the consult and check each field really holds the text.
- [ ] HugeRTE keeps the chart picture: in Discharge Summary (and the email body), the `data:` URI image is still there after Save & Close and a reload, not stripped or replaced by a broken image.
- [ ] Long send and service-worker lifetime: a multi-field send with the chart picture finishes, and one that approaches the web app's 120 s timeout either completes or ends with "some fields may already have been written" (no silent half-send). Chrome may stop an idle worker after 30 s; a send keeps it busy, but check it is not cut off.
- [ ] Cold service worker: stop the worker (chrome://extensions, Service worker, Stop), then open Send to ezyVet: the second ping (1.5 s) wakes it and the dialog loads, not the "not responding" explainer.
- [ ] Failed popup write: after a failure such as `popup_not_closed` or `save_not_confirmed`, check whether a half-open popup is left on the consult, and that the next Send asks first.

- [ ] Extension loads unpacked with no manifest errors; the id equals `DEV_EXTENSION_ID`.
- [ ] Ping: the web app detects the extension and shows its version.
- [ ] Inspect: with one consult open, the field list matches the fields ezyVet shows and the consult's patient name is read.
- [ ] Each field kind, sent from ToothOps and checked in ezyVet after a page reload:
  - [ ] Note field (Lexical or HugeRTE editor)
  - [ ] Popup field (textarea in a popup)
  - [ ] In-person / discharge summary field (with the chart picture, where accepted)
  - [ ] Client Communication email is not offered as a target
- [ ] Text and picture to the same field arrive as one document, image last.
- [ ] Template overwrite: a field that pre-fills from a template is replaced, not appended to, and other ezyVet requests are unaffected afterwards.
- [ ] Locked consult: status reads locked, no fields are offered, and Send is refused (`not_writable`).
- [ ] Combined view: status reads combined, no fields offered, Send refused.
- [ ] Not on a consult / not on the Medical tab: the matching state is shown and Send is refused.
- [ ] Wrong patient: with a different patient open, the dialog shows both names and needs Send anyway (names match on whole words: "Bella" matches "Bella Smith", "Max" does not match "Maxine"); if another consult is opened between the check and Send, or between two fields, the rest is refused (`patient_changed`).
- [ ] Two ezyVet tabs open: the dialog names the tab that will be used, and it is the active tab of the focused window.
- [ ] Sending twice: the dialog asks first ("Sending again adds a second copy"); the second send adds a second copy and does not corrupt the first.
- [ ] One item fails (for example a mapped field the consult lacks): the other items are still written and the failure is listed per field.
- [ ] Restart the service worker (chrome://extensions, Service worker, Stop) and send again: it still works.
- [ ] Copy diagnostic report contains selector hit counts, state, field titles and kinds, editor flags, version and last failure codes, and no patient, client or note text.

### Side panel checklist on real ezyVet

- [ ] Panel opens from the toolbar icon; sign in with password, then Google (and Apple if enabled) completes and returns to the chart list.
- [ ] Pinned match: with a consult for patient X open, the chart for X is pinned as "Matches this consult" (ezyVet name equal to the chart name, or chart name + owner surname); a chart that only shares a word shows as a possible match beside the ezyVet name and asks before sending; with no matching patient, nothing is shown.
- [ ] Practice flag off (outside the free beta): the chart view says sending isn't turned on and has no Send.
- [ ] Already sent: send, go Back, pick the same chart, Send: it asks first (also after closing and reopening the panel).
- [ ] Send from the panel: pick a chart, map fields, Send; reload the consult and check each field (including the chart picture) holds the text.
- [ ] Consult switched inside ezyVet (no tab change), then Send: the panel shows the notice that the consult changed with the new target and writes nothing.
- [ ] Focus refresh: switch to ezyVet and back to the panel; the target refreshes but mapping choices already made are kept.
- [ ] Sign-out: the panel returns to sign-in, the web app stays signed in, and signing in again (or as another user) shows the chart list, not the chart that was open. Sign out is greyed out during a send.
- [ ] Expired session: leave the panel signed in until the session expires (or revoke it in Supabase); the panel asks to sign in again instead of showing an error loop.

### Today's patients checklist on real ezyVet

- [ ] **High risk:** the bracketed tooltip number equals the patient number ezyVet shows on the patient record.
- [ ] With ezyVet on the calendar, the list fills in by itself when the panel opens.
- [ ] From another page, the Load button switches the tab to the calendar and loads the list; the tab ends on the calendar.
- [ ] Known limitation: after the panel changes the calendar date it waits 1.5 s; if ezyVet refreshes more slowly, the previous day's blocks could be read. After a Load from another day, check the list shows today's patients.
- [ ] Empty day: the panel says there are no patients on today's schedule.
- [ ] An appointment without a patient is skipped.
- [ ] A block without a vet still lists the patient, with no vet.
- [ ] Start chart opens ToothOps and fills patient name, owner and patient number (after the discard question, if the open chart has unsaved work).
- [ ] Expired hand-over: click Start chart, wait over 2 minutes before the tab loads or reload it, and the fallback toast appears.
- [ ] Open chart for a patient with a chart dated today opens that chart; New visit for an older chart starts a visit from it.
- [ ] Signed in as another account in the web app: nothing is filled in and the toast says to use the same account.
- [ ] Consult number read on send: with a consult open, the patient numbers on both sides decide "Different patient?" and the prompt names both.
