# Rabbit support verification — 2026-11-18

## Scope
Rabbit chart anatomy, PatientForm species selection (web/native preview), species filtering, owner-report defaults, record notes and PDF export/import. This is a focused feature review, not a full application UI review. Existing theme changes were preserved.

## Design reference and anatomy
The selector reuses GitHub's compact disclosure pattern: common choices remain visible, less common choices share Other, selected species stays visible. It uses the app's existing teal accents and neutral control tokens. A text mockup and anatomical design were approved before implementation.

The original SVG follows the user's occlusal reference. Adult rabbit dentition is 28 teeth: upper 101/102/106–111 and 201/202/206–211; lower 401/407–411 and 301/307–311. Small upper peg incisors are separate selectable teeth; the long toothless gaps, curved reserve crowns, six upper/five lower cheek teeth, and patient-right-on-viewer-left orientation are represented schematically.

Sources:
- [University of Edinburgh, Veterinary Dentistry basics](https://www.link.vet.ed.ac.uk/clive/cal/Dentistry/Website/Shared_Media/pdfs/Basics_print.pdf): rabbit tooth numbering/reference.
- [VCA, Dental disease in rabbits](https://vcahospitals.com/know-your-pet/dental-disease-in-rabbits): peg teeth, continuous growth and feeding after treatment.
- [Royal Veterinary College, rabbit dental disease research](https://www.rvc.ac.uk/vetcompass/news/new-rvc-vetcompass-research-offers-insights-into-clinical-management-and-welfare-impacts-of-rabbit-dental-disease?page=2): hay and grass in dental care.
- [RSPCA, rabbit health](https://science.rspca.org.uk/en/web/rspca/adviceandwelfare/pets/rabbits/health): prompt veterinary contact for reduced eating/droppings.

## Screen/state/viewport matrix
| Screen | States | Viewports | Languages | Evidence |
| --- | --- | --- | --- | --- |
| Web patient form + rabbit diagnosis diagram | Populated, long patient/owner names, missing/extracted marks and anchored comment | 1280, 390, 320px | en, de | 6 screenshots |
| Web patient form + rabbit diagnosis diagram | Empty name and unmarked/comment-free diagram | 1280, 390, 320px | en, de | 6 screenshots |
| Native patient form + rabbit diagnosis diagram (browser iOS preview) | Populated/long names and empty diagram | 390, 320px | en | 4 screenshots |
| Web/native Other selector | Rabbit → Equine → Rabbit; focus ring and picker-open attempt | Same applicable viewports | en/de web; en native | Additional screenshots and assertions |
| Rabbit diagram | Numbers on/off; all 28 number labels; independent peg marking by Enter; main incisor remains unmarked | All viewport/state combinations | As above | Browser assertions |
| Native species/dentition | Labels above controls; species hit targets at least 44px; no overlap | 390,320px | en | Screenshots and assertions |

Automated browser checks found no page overflow, no number-to-number or number-to-tooth collisions, and no page errors across all 16 cases. Desktop/phone screenshots were inspected directly, including long names, empty/populated diagrams, German labels, focused selector and native 320px. Native labels were stacked after visual inspection caught a dentition-label collision. Rabbit cheek-tooth numbers were moved to outside columns after initial overlap checks failed. Small phone diagrams retain the established zoom controls.

Reproduce with Vite on port 5187 and Playwright available:

```sh
npm run start -- --host 127.0.0.1 --port 5187
PLAYWRIGHT_MODULE=/path/to/playwright-core node scripts/verify-rabbit.cjs
```

Screenshots and the 16-case JSON matrix: `/tmp/rabbit-review/`. Fixture: `scripts/fixtures/rabbit-preview.html`. The fixture uses actual PatientForm and DiagramView components. Anatomy generator: `python3 scripts/diagrams/rabbit-teeth.py`.

## Automated checks
- Full `npm test`: **289 files, 3,116 tests passed** after moving native field sizing into its owning Form.css. The field-style isolation test caught the initial rule placement in EntryGrid.css.
- Rabbit-focused tests independently reviewed: 7 files, 131 tests passed.
- PDF integration test exports all 28 table tooth numbers, excludes 104, checks the rabbit header, and imports the entire tooth data plus 102's missing mark unchanged.
- Pseudo-locale coverage exercises rabbit/equine selector labels. All enabled app languages and Portuguese owner reports have translated additions and stamped metadata.
- `npm run build`: **passed**, including i18n validation (0 problems), ESLint, TypeScript and Vite. Existing large-chunk warning remains.

## Coverage gaps and limits
- Browser screenshots do not capture the operating system's native select popup; open-picker attempts produced focused-control captures. Option contents, switching and Escape handling were exercised. Physical iOS/Android picker appearance remains unverified.
- Native preview is Chromium with iOS styles, not a physical device/WebKit run.
- Live authenticated cloud save/reopen was not exercised. Storage paths were traced: speciesBase preserves rabbit; the existing free-text species column needs no migration. PDF save/import was exercised end to end.
- Patient-library single/multiple visit layouts were not visually reviewed; no visit-row layout was changed. Native rabbit/equine filter behavior is covered by interaction tests.
- French/Italian/Spanish/Hungarian/Romanian/Chinese/Arabic translations pass catalog checks but were not all screenshot-reviewed. User-customized owner-report tips intentionally override species defaults.
- The supplied reference guided the artwork; this review verified tooth count, numbering and orientation rather than obtaining independent anatomical specialist review.

## Review
Independent read-only verifier: PASS, no blocking functional defects. Confirmed rabbit storage identity, generic cloud schema compatibility, tooth data/geometry, selector interactions, owner-report defaults, and PDF roundtrip. Earlier PDF-test optional-state TypeScript error was corrected before the passing build. `git diff --check` passed.
