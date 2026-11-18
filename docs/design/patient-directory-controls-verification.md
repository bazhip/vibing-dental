# Patient directory controls, history and hover verification

## Scope and design
User requested a secondary PDF import action at the bottom of Patients, New patient aligned with search/filters, owner-detail search, reliable Version history opening, and consistent hover feedback. The compact toolbar/footer mockup reused the GitHub dialog hierarchy and was shown before implementation. Shared hover treatment uses a subtle teal outline; quiet Dictate/account controls also receive a neutral fill. Existing primary/destructive/recording colors and keyboard focus are preserved.

## Behavior
- Import chart PDF and its existing hidden file input moved together into a footer outside the scrolling results. Cancellation/error/success handlers are unchanged.
- The search field flexes into available toolbar space. Search matches patient name/number and owner name/phone/email server-side; the placeholder now mentions owners, translated in all nine enabled app locales and explicitly rehashed.
- Browser reproduction demonstrated that History and Patients both used z-index 1100 and History could be hidden when its portal mounted first. History now owns layer 1150, above Patients and below confirmation dialogs 1200. Normal full EntryGrid action clicks also opened History successfully in the mocked-backend check.
- Shared fine-pointer hover outline covers HTML buttons, disclosure summaries and links with button role across the web app; disabled and keyboard-focused controls are excluded. Touch/native hover is excluded. Idle Dictate and the sidebar account/email button receive neutral hover fills in their owning styles. Recording/processing/error fills are preserved. Phone patient row actions are at least 44px high.

## Screen/state/viewport matrix
| Surface | States | Viewports | Themes | Evidence |
| --- | --- | --- | --- | --- |
| Patients modal toolbar/footer | Populated and empty library; two doctor filters; long patient/owner names | 1280,1024,390,320px | Light/dark | 16 base screenshots |
| Patients rows | Single visit and expanded multiple visits; open Actions menu | Same | Light/dark | Additional menu screenshots |
| History | Empty-history state opened from expanded visit; Escape dismissal and action-summary focus return | Same populated cases | Light/dark | Screenshots and interaction assertions |
| History layering | Both portals present in reversed mount order | 320px | Dark | elementFromPoint asserts History on top |
| Owner search | Owner name, phone and email each return the matching patient; query reaches the list callback | All populated cases | Light/dark | Browser assertions plus actual server-query unit test |
| Hover | New visit, New patient, footer Import, Dictate, sidebar account/email | 1280px | Light/dark | Computed-style comparisons and hover screenshots |
| Interaction safeguards | Disabled control unchanged; actual Tab focus ring; Dictate recording fill preserved on hover | 1280px | Light/dark | Browser assertions |

The browser checks assert toolbar alignment at desktop widths, controls at least 44px high, footer visibility within the viewport, no horizontal page overflow, and no browser page errors. Phone expanded-menu positioning and long-name wrapping/truncation were visually inspected. The compact footer keeps Import available while the result list scrolls.

## Reproduce
Start Vite on 5188, then run:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright-core node scripts/verify-patient-directory.cjs
```

Actual ChartLibrary and ChartHistoryModal components render in `scripts/fixtures/patient-directory-preview.html`; only backend hooks are mocked. Adding `?app=1#/library` renders the full EntryGrid harness with suitable cloud hook mocks. Screenshots and coverage JSON are in `/tmp/patient-directory-review/`.

## Automated checks
- `npm test`: **289 files, 3,117 tests passed** on the final changes.
- `npm run build`: **passed**, including i18n validation (0 problems), ESLint, TypeScript and Vite; existing chunk-size warning remains.
- Translation work check: `todo=0 remove=0`; `git diff --check` passes.
- Browser matrix: **16 cases passed**, no page errors, plus history stacking/focus and hover safeguards.
- Screenshots directly inspected: dark1280 populated toolbar/footer, dark390 and dark320 expanded visits/menus, light320 empty, dark320 History, dark Dictate hover, and light account hover.
- Independent read-only reviewer found no concrete code regression, independently confirmed named hover controls/history layering, and inspected phone screenshots. Full application-wide visual review was not claimed.

## Limits
This is a focused interaction review, not a full application UI review. The shared hover rule applies application-wide, but every route/button/state was not individually screenshot-reviewed. Browser screenshots cover English; translated wording passes catalog checks but other locales were not visually reviewed in this task. Real authenticated backend search/history and physical-device interactions were not exercised. File import preserves its tested existing behavior; no live clinical PDF was imported. History populated/loading/error text is covered by existing component/pseudo-locale tests, while this browser matrix uses empty history.
