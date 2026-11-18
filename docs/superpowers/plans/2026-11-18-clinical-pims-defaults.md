# Clinical PIMS defaults

User-authorized follow-up to CT/GP transcription: map the new clinical sections into existing PIMS note destinations. Use the existing saved mapping controls and reviewed send flow. No new UI or native clinical transactions.

Design: history -> History/Subjective; vitals/exam/diagnostics -> Objective/Physical Exam; assessment -> Assessment; plan -> Plan; CT -> Imaging/Objective; discharge -> Discharge notes/summary or a supported plan note. Prefer provider-specific known field names (including Shepherd's exact compound labels and Rhapsody's medical/discharge notes). Resolve against inspected non-email fields only, with no first-match choice among ambiguous fields. Saved strings and explicit null override defaults. Unavailable defaults remain unselected. Existing dental mappings remain unchanged. Shared clinical forms and mapping rows reuse the established GitHub-style source/destination selection pattern with existing controls; only their selected values change.

Alternatives: leave all destinations manual (the gap the user asked to remove); assign the same SOAP labels blindly across providers (unsupported and ambiguous fields); selected approach detects usable destinations while preserving overrides.

- [x] Add failing tests for all providers, grouping without loss, missing/ambiguous fields, saved skips and overrides.
- [x] Implement one shared clinical-default resolver and connect profile-based sending and Pulse/Rhapsody/Vetspire saved-section autofill.
- [x] Test late saved-map loading and source/target changes; defaults must not enable preparation before preferences settle.
- [x] Verify existing mapping UI at desktop/390/320 with populated clinical sections. Run full tests/build, extension packaging, translation check and diff check.

Native-resource investigation: inspect actual adapter contracts and public primary API documentation. Explain current note-only support and distinguish provider API capability from implemented/authorized native writes. Do not submit prescriptions, orders or billing transactions as part of mapping defaults.

## Implementation and review

- Shared `clinicalMappings.ts` applies only detected, non-email note fields. Equal-priority aliases and duplicate compound destinations remain unselected. Specific field tiers precede generic SOAP and medical-note fallbacks.
- Profile-based Send and saved-section autofill share these defaults; saved values and explicit nulls win. Both load errors and timeouts block automatic sending until retry succeeds. A changed field schema or effective mapping aborts an in-flight send before dispatch.
- Delayed saved mapping loads merge untouched saved choices with locally edited rows. Clear writes explicit skips for all clinical keys so later visits do not resurrect defaults for previously absent sections.
- Presenting complaint now has a separate translated note section mapped to History (Shepherd Initial Complaint), keeping the default-skipped demographic header separate. Legacy stored notes split their original complaint wording from the old header, preserving edits, multiline text and deliberate removals. Unclassified retained text falls back to the full note; complaint notes that cannot split safely require an explicit whole-note destination instead of an implicit Plan target.
- Independent review reproduced and verified fixes for preference readiness/merge/error races, ambiguity and stale destination schemas. 224 focused tests passed after complaint compatibility fixes.

## Scoped visual coverage

| Surface | States | Sizes and themes | Evidence |
| --- | --- | --- | --- |
| Profile mapping rows | Populated eleven-section defaults, ezyVet and Shepherd | 1440/390/320; light/dark; top/end scroll | Actual shared MappingRows with synthetic inspected fields |
| Editor autofill mapping | Populated defaults, long patient/tab title, Pulse/Rhapsody/Vetspire | 1440/390/320; light/dark; top/end scroll | Actual PimsNoteAutofill with fixture transport/preferences |
| Send dialog | Preferences loading, error/retry and ready | 1440/390/320; light/dark; top/end scroll | Actual SendToEzyvetDialog with fixture transport/preference state |

Mapping matrix: 30 cases /60 captures, `/private/tmp/clinical-maps-visual.json`. Send status matrix: 18 cases /36 captures, `/private/tmp/clinical-maps-status-visual.json`. No horizontal/control overflow or page errors. Inspected alignment, wrapping, selected values, scroll access and phone action reachability. These are scoped component/rendered-state checks, not full application coverage. OS select popups, native iOS runtime, real PIMS templates/provider sessions and live saves are unverified. No clinical transaction was submitted.

## Native PIMS resources

Current PimsAdapter exposes note fields/writes, appointments, patient lookup and optional sync source. The separate Shepherd physical-exam workflow can open a native template; it does not make general GP text into structured native measurements.

Provider APIs can support separate native operations: [ezyVet prescription management](https://developers.ezyvet.com/endpoints/prescription-management.html) explicitly documents prescription/external-prescription creation and write scopes; [Shepherd prescriptions](https://developer.shepherd.vet/api-reference/resources/prescriptions/) documents creation tied to patient, prescribing doctor and clinic product catalog. These establish API possibility for those providers, not deployed ToothOps capability or support across all seven PIMS. Native writes require provider-specific credentials/scopes and structured, reviewed resource data/IDs; current free-text vitals/medications remain note content. No prescription, diagnostic order, charge or invoice write was added.

Additional primary-source capability checks: [Shepherd SOAP records](https://developer.shepherd.vet/api-reference/resources/soap-records/#writing-soap-records) explicitly documents `POST /pav2/open-api-soap-vital-entries/write` and imaging uploads, while SOAP creation/narrative sections are read-only through the public API. [ezyVet Billing and Payments](https://developers.ezyvet.com/endpoints/billing-and-payments.html) documents `POST /v2/invoice` and `POST /v2/invoiceline`. Provider support must be evaluated resource by resource; a POST search endpoint is not evidence of creation support.

## Final verification

- Full suite: **353 files /4,765 tests passed**, `/private/tmp/clinical-mappings-release-tests.log` (129.48 seconds).
- Production build (including i18n, ESLint and TypeScript), store extension packaging, translation check (`todo=0 remove=0`) and diff checks passed.
- Final independent review: PASS;139 focused tests, typecheck and diff check passed. No remaining blockers. Generated and legacy stored complaint cases were verified separately, including edited wording, deliberate removal, multiline content, and heading-only removal with explicit whole-note fallback.
- Final screenshot matrices cover 30 mapping cases and18 send-status cases as listed above; no new source changes followed the final verification run.
