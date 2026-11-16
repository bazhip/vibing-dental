# Chrome Web Store listing: ToothOps for ezyVet

Draft for the owner to paste into the Chrome Web Store developer dashboard. Package with `npm run package:extension` and upload `build-extension.zip`.

## Store listing

**Name:** ToothOps for ezyVet (matches `extension.name` in `src/locales/en/pims.json`)

**Short description (63 characters, limit 132):**
Writes your ToothOps record notes into the open ezyVet consult.

**Detailed description:**

ToothOps for ezyVet is the companion extension for ToothOps Charting (toothops.app), veterinary dental charting software.

Chart a dental in ToothOps, then send the record note and the chart picture straight into the ezyVet consult you already have open. No copying and pasting between tabs, and no retyping.

How it works
- Open the patient's consult in ezyVet (Medical tab) and keep ToothOps open in another tab.
- In ToothOps choose Send to ezyVet. ToothOps shows which consult it found and which ezyVet fields are available.
- Map each part of your record to the ezyVet field you want, check the patient name, and send.
- You see a per-field result list. If one field fails, the others are still written and the failure is listed.

Designed to be careful
- It writes only when you press Send, in ToothOps or in its side panel. While the side panel is open, it looks at the open ezyVet consult (patient name and field names) when you switch tabs or come back to the panel, so it can show the right target; it reads no note content.
- When you open the side panel, or press Load, it reads today's ezyVet calendar and each appointment's tooltip (patient name, patient number, owner and vet) to list today's patients. It moves your ezyVet tab to the calendar only when you press Load.
- It checks the patient name and warns you if the open consult is for a different patient.
- It will not write into locked consults or the combined view.
- The side panel loads your charts from your ToothOps account. The record note and chart picture are then sent to ezyVet from your browser; the extension sends them nowhere else.

Side panel
- Click the ToothOps icon to open a side panel. Sign in with email, Google or Apple, pick a recent chart (the one matching the open consult is pinned at the top), and send it to ezyVet the same way.
- Today's patients: the panel lists the patients on today's ezyVet calendar. Start chart opens ToothOps with the patient's name, number and owner filled in, or starts a new visit from the patient's latest chart.
- It checks the consult again when you press Send and stops if you have switched consults in ezyVet.

Requirements: a ToothOps account, Google Chrome, and ezyVet open in a tab. ToothOps is independent software and is not affiliated with or endorsed by ezyVet.

**Category:** Productivity (alternative: Workflow and Planning).

**Language:** English (the extension also ships en, fr, de, it, es name and description via `_locales`).

**Visibility:** Unlisted (anyone with the link can install; not searchable). Switch to Public later if wanted.

## Privacy practices tab

**Single purpose:** Connect ToothOps dental charting with the user's open ezyVet: write the veterinary record note and chart image created in ToothOps into the user's open ezyVet consult when the user chooses Send to ezyVet in ToothOps or in the extension's side panel, and, when the user opens the side panel or presses Load, read today's ezyVet calendar and the appointment tooltip so the user can start a ToothOps chart for a patient on today's schedule.

**Permission justifications**

- `scripting`: Used to run a small content script in the user's open ezyVet tab, to read the names of the consult's note fields and the patient name, and to insert the note text and chart image into the fields the user selected. It runs in response to a request from toothops.app or from the extension's own side panel. While the side panel is open, the panel also checks the open consult automatically (when the panel gains focus or becomes visible, the active tab changes, or the ezyVet tab finishes loading) to show the current target; it writes only when the user presses Send. When the user opens the side panel or presses Load, it also reads today's ezyVet calendar and each appointment's tooltip (patient name, patient number, owner, vet) to list today's patients. Without Load it only reads a calendar already showing today; Load switches the ezyVet tab to today's calendar.
- `sidePanel`: Shows the extension's side panel (chart list and send flow) beside the page when the user clicks the toolbar icon.
- `identity`: Used only for `chrome.identity.launchWebAuthFlow`, so the user can sign in to their ToothOps account with Google or Apple in the side panel. The returned PKCE code is used only to sign in to ToothOps.
- `storage`: Used only for `chrome.storage.session`, to hold the patient the user picked in the side panel (name, patient number, owner name) in memory only, for one hand-over to the ToothOps tab it opened. Nothing is written to disk. The entry is cleared when ToothOps takes it, when that tab closes, on the next Start chart or take after it has expired (ToothOps accepts it only within 2 minutes), and when the browser closes.
- Host permission `https://*.ezyvet.com/*`: ezyVet is hosted on a per-practice subdomain of ezyvet.com, so the extension needs access to those pages to find the open consult and write into it. It does not request access to any other site.
- `externally_connectable` (`https://toothops.app/*`): Lets the ToothOps web app send messages to the extension (check status, list fields, send a note). No other site can talk to the extension. (The local development origin is only in the unpacked dev build; `npm run package:extension` builds the store zip without it.)
- Remote code: No. All code is in the package; nothing is loaded or evaluated from the network.

**Data usage disclosure (what the extension handles)**
- Health information: Yes, in the sense that veterinary clinical note text is moved. It is animal health, not human health, but if the form is ambiguous tick "Health information".
- Personally identifiable information: patient (animal) names, owner names and possibly client details in the note text. The side panel reads them from the user's own ToothOps account to list and match charts, and the note is passed to ezyVet at the user's request. The extension stores none of it on disk. Today's patients are read from the ezyVet calendar and appointment tooltip when the user opens the side panel or presses Load. The patient the user picks (name, patient number, owner name) is held in `chrome.storage.session` memory only, for one hand-over: cleared when ToothOps takes it, when the tab closes, on the next request after it expires, and when the browser closes.
- Authentication information: Yes, the side panel signs the user in to their ToothOps account (the session is stored in the extension's own local storage).
- Everything else (financial, location, web history, user activity, website content beyond the ezyVet consult fields): No.

Description for the reviewer: The extension handles clinical note text and a chart image. From the ToothOps web app they are passed locally in the browser from the ToothOps tab to the ezyVet tab at the user's request. The side panel signs in to the user's ToothOps account (Supabase), reads their profile (language, saved field mapping and their practice's send setting) and their own charts, saves their field mapping, and records when a chart was sent; the note and chart image are then written into ezyVet in the browser. While open, the panel checks the open ezyVet consult (patient name and field names, no note content) when it gains focus, becomes visible or the tab changes, and when it is opened or the user presses Load it reads today's ezyVet calendar and appointment tooltips to list today's patients; a picked patient's name, number and owner are held in `chrome.storage.session` memory for one hand-over to the ToothOps tab it opens. The extension sends nothing else to any server.

**Certifications (tick all three)**
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes unrelated to the item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** `https://toothops.app/privacy` (the existing page, `public/privacy.html`, served at `/privacy`). Append the section below to it before submitting, and bump its "Last updated" date. The dashboard requires the URL to be public and to mention the extension.

## Draft privacy-policy section (append to public/privacy.html)

**ToothOps for ezyVet browser extension**

The ToothOps for ezyVet Chrome extension writes record notes created in ToothOps into the ezyVet consult you have open. When you choose Send to ezyVet, the extension reads the patient name and the list of note fields on your open ezyVet consult, and inserts the note text and chart image you selected into the fields you chose. This happens inside your browser, between your ToothOps tab and your ezyVet tab.

The extension has a side panel where you can sign in to your ToothOps account (email, Google or Apple) and pick a saved chart to send. The panel talks to ToothOps to sign you in, read your profile (your language, your saved ezyVet field mapping and whether sending is turned on for your practice), load your own charts, save changes to your field mapping and record that a chart was sent. While the panel is open, it checks the open ezyVet consult (the patient name and the list of note fields) when you switch tabs or return to the panel, so it can show which consult a send would go to; it writes into ezyVet only when you press Send. When you open the panel or press Load, it reads today's ezyVet calendar and each appointment's tooltip (patient name, patient number, owner and vet) to list today's patients; it moves your ezyVet tab to the calendar only when you press Load. When you start a chart from that list, the patient's name, number and owner are held in the browser's session memory (never on disk) for the ToothOps tab it opens, and cleared when ToothOps takes them, when that tab closes, after they expire, and when the browser closes. The extension sends no other information to us or to any third party, and it does not collect analytics. It does not read or store the contents of your ezyVet records beyond what is needed for a send in progress. It stores your ToothOps sign-in session in the extension's own browser storage until you sign out of the panel, remembers for the current browser session which charts the panel sent and when (chart ids and dates only, cleared when you sign out), and keeps the failure codes of the last send in memory, which contain no patient, client or note text and are gone when Chrome stops the extension's background worker. It runs only on ezyvet.com pages, and only toothops.app and the extension's own side panel can ask it to read or write a consult. We do not sell the information the extension handles, use it for advertising or unrelated purposes, or load remote code. Information you save in ToothOps itself is covered by the rest of this policy.

## Screenshots (1280x800, PNG or JPEG, 24-bit, no alpha; 1 to 5)

Real screenshots are needed; none are included. Use a test patient and fictitious owner data, with ezyVet and ToothOps patient names blurred or invented.

1. **Send to ezyVet dialog with mapping rows.** ToothOps record note open, dialog showing the detected ezyVet consult and patient name, each record section on the left mapped to an ezyVet field on the right, Send button visible. Caption: "Map each part of your note to the ezyVet field you want."
2. **Results list.** The same dialog after sending: one row per field with a success mark, including the chart picture. Ideally one deliberately failed row to show per-field reporting. Caption: "See exactly what was written, field by field."
3. **Side panel.** The ToothOps side panel beside an ezyVet consult: the chart for the open patient pinned as "Matches this consult" above the recent charts. Caption: "Your chart for this patient is one click away."
4. (Optional) **In ezyVet.** The consult's Medical tab with the note and chart picture now in place. Caption: "The note lands in your open consult."
5. (Optional) **Wrong patient warning.** Dialog showing both patient names and the Send anyway button. Caption: "Warns you before writing to the wrong patient."

Also needed: a 440x280 small promo tile (required by the dashboard; use the teal tooth mark on the ToothOps teal `#0C6B63`). Marquee tile is optional. The 128 px store icon is `src/extension/icons/icon-128.png`.

## Owner decisions

- Decided: the manifest asks for `scripting`, `sidePanel`, `identity` and `storage` (`sidePanel` and `identity` for the side panel, phase 2; `storage` only for `chrome.storage.session`, which holds the Start chart hand-over in memory for one use; ToothOps accepts it only within 2 minutes, and an unused one is cleared when its tab closes, on the next request after it expires, or when the browser closes). It shows no install warning.
- The side panel's sign-in session lives in the extension page's `localStorage`, not in `chrome.storage`.
- Decided: the store build (`npm run package:extension`) ships `externally_connectable` and the background's allowed origins with `https://toothops.app` only.
- Health information box on the data usage form (see above).
- Add the extension section to `public/privacy.html` and deploy before submitting.
- Support contact for the dashboard: bazhip@gmail.com is what the privacy page uses.
