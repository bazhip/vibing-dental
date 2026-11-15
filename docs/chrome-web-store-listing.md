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
- It only works when you ask it to, from ToothOps. It does nothing on its own.
- It checks the patient name and warns you if the open consult is for a different patient.
- It will not write into locked consults or the combined view.
- It never sends your data to any server. It moves text and the chart image from your ToothOps tab to your ezyVet tab, inside your browser.

Requirements: a ToothOps account, Google Chrome, and ezyVet open in a tab. The extension has no popup or settings of its own. ToothOps is independent software and is not affiliated with or endorsed by ezyVet.

**Category:** Productivity (alternative: Workflow and Planning).

**Language:** English (the extension also ships en, fr, de, it, es name and description via `_locales`).

**Visibility:** Unlisted (anyone with the link can install; not searchable). Switch to Public later if wanted.

## Privacy practices tab

**Single purpose:** Write the veterinary record note and chart image created in ToothOps into the user's open ezyVet consult, when the user chooses Send to ezyVet in ToothOps.

**Permission justifications**

- `scripting`: Used to run a small content script in the user's open ezyVet tab, to read the names of the consult's note fields and the patient name, and to insert the note text and chart image into the fields the user selected. Runs only in response to a request from toothops.app.
- Host permission `https://*.ezyvet.com/*`: ezyVet is hosted on a per-practice subdomain of ezyvet.com, so the extension needs access to those pages to find the open consult and write into it. It does not request access to any other site.
- `externally_connectable` (`https://toothops.app/*`): Lets the ToothOps web app send messages to the extension (check status, list fields, send a note). No other site can talk to the extension. (The local development origin is only in the unpacked dev build; `npm run package:extension` builds the store zip without it.)
- Remote code: No. All code is in the package; nothing is loaded or evaluated from the network.

**Data usage disclosure (what the extension handles)**
- Health information: Yes, in the sense that veterinary clinical note text is moved. It is animal health, not human health, but if the form is ambiguous tick "Health information".
- Personally identifiable information: the patient (animal) name and possibly client details if present in the note text, handled in transit only.
- Everything else (financial, authentication, location, web history, user activity, website content beyond the ezyVet consult fields): No.

Description for the reviewer: The extension handles clinical note text and a chart image. They are passed locally in the browser from the ToothOps tab to the ezyVet tab at the user's request. Nothing is transmitted to any server by the extension.

**Certifications (tick all three)**
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes unrelated to the item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** `https://toothops.app/privacy` (the existing page, `public/privacy.html`, served at `/privacy`). Append the section below to it before submitting, and bump its "Last updated" date. The dashboard requires the URL to be public and to mention the extension.

## Draft privacy-policy section (append to public/privacy.html)

**ToothOps for ezyVet browser extension**

The ToothOps for ezyVet Chrome extension writes record notes created in ToothOps into the ezyVet consult you have open. When you choose Send to ezyVet, the extension reads the patient name and the list of note fields on your open ezyVet consult, and inserts the note text and chart image you selected into the fields you chose. This happens inside your browser, between your ToothOps tab and your ezyVet tab.

The extension does not send any information to ToothOps, to us, or to any third party, and it does not collect analytics. It does not read or store the contents of your ezyVet records beyond what is needed for a send in progress. It stores nothing in the browser: the only state it keeps is the failure codes of the last send, in memory, which contain no patient, client or note text and are gone when Chrome stops the extension's background worker. It runs only on ezyvet.com pages and only responds to requests from toothops.app. We do not sell the information the extension handles, use it for advertising or unrelated purposes, or load remote code. Information you save in ToothOps itself is covered by the rest of this policy.

## Screenshots (1280x800, PNG or JPEG, 24-bit, no alpha; 1 to 5)

Real screenshots are needed; none are included. Use a test patient and fictitious owner data, with ezyVet and ToothOps patient names blurred or invented.

1. **Send to ezyVet dialog with mapping rows.** ToothOps record note open, dialog showing the detected ezyVet consult and patient name, each record section on the left mapped to an ezyVet field on the right, Send button visible. Caption: "Map each part of your note to the ezyVet field you want."
2. **Results list.** The same dialog after sending: one row per field with a success mark, including the chart picture. Ideally one deliberately failed row to show per-field reporting. Caption: "See exactly what was written, field by field."
3. (Optional) **In ezyVet.** The consult's Medical tab with the note and chart picture now in place. Caption: "The note lands in your open consult."
4. (Optional) **Wrong patient warning.** Dialog showing both patient names and the Send anyway button. Caption: "Warns you before writing to the wrong patient."

Also needed: a 440x280 small promo tile (required by the dashboard; use the teal tooth mark on the ToothOps teal `#0C6B63`). Marquee tile is optional. The 128 px store icon is `src/extension/icons/icon-128.png`.

## Owner decisions

- Decided: the unused `storage` permission was removed; the manifest asks for `scripting` only.
- Decided: the store build (`npm run package:extension`) ships `externally_connectable` and the background's allowed origins with `https://toothops.app` only.
- Health information box on the data usage form (see above).
- Add the extension section to `public/privacy.html` and deploy before submitting.
- Support contact for the dashboard: bazhip@gmail.com is what the privacy page uses.
