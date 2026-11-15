# ToothOps for ezyVet (Chrome extension)

Writes ToothOps record notes into the open ezyVet consult. The web app talks to the
background worker over `chrome.runtime.sendMessageExternal` (`protocol.ts`); the worker
injects `ezyvet-page.js` into the ezyVet tab and calls `window.__toothopsEzyvet`.

## Build and load

```
npm run build:extension      # writes build-extension/ (git-ignored)
```

1. Open `chrome://extensions`, switch on Developer mode, choose Load unpacked, pick `build-extension/`.
2. The id shown must equal `DEV_EXTENSION_ID` in `src/extension/extensionId.ts`.
3. Run the web app on `http://localhost:5173` (or production) and use Send to ezyVet.

PR previews cannot reach the extension: `externally_connectable` needs exact hosts.
The build stamps `package.json` `version` into the manifest and into the code
(`VITE_EXTENSION_VERSION`, see `src/extension/version.ts`).

Name and description come from `src/locales/<lng>/pims.json` (`extension.name`,
`extension.description`), generated into `_locales/<lng>/messages.json`.

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

## Manual checklist on real ezyVet

jsdom cannot prove that ezyVet saved. The Send to ezyVet button stays behind
`practices.pims_send_enabled` until this has passed on a real consult at least once.
The page fixtures are synthetic (built from reference selectors), so every selector is unverified.

Use a test patient. For each step note pass/fail, and attach Copy diagnostic report on a failure.

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
- [ ] Wrong patient: with a different patient open, the dialog shows both names and needs Send anyway; if the patient changes between the check and Send, the send is refused (`patient_changed`) and nothing is written.
- [ ] Two ezyVet tabs open: the dialog names the tab that will be used, and it is the active tab of the focused window.
- [ ] Sending twice: the second send replaces or appends as designed and does not duplicate or corrupt the first.
- [ ] One item fails (for example a mapped field the consult lacks): the other items are still written and the failure is listed per field.
- [ ] Restart the service worker (chrome://extensions, Service worker, Stop) and send again: it still works.
- [ ] Copy diagnostic report contains selector hit counts, state, field titles and kinds, editor flags, version and last failure codes, and no patient, client or note text.
