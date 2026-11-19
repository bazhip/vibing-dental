# CT and GP transcription implementation plan

**Goal:** Dedicated CT dictation/refinement and a full GP transcription workflow: consultation/history, vitals/physical exam/diagnostics, assessment/plan, performed treatment and discharge sources, with reviewable output and persisted transcript provenance.

**Verified reference:** ScribbleVet1.31.3 sidepanel bundle SHA256 c14a441693e342d5c8344b5041e609dc036e562aab96abf4d1f1069e1e0278d3. Visit -> notes[] -> ordered sections[] plus audioFiles[]. Note.includedAudioFileIds/reviewedAt/completedAt and section id/title/value/type/weight/version/draft at sidepanel.b7741352.js:163239–163303; SectionType HISTORY/EXAM/ASSESSMENT/PLAN/DISCHARGE/SOAP_SIMPLE/FORMATTED_DICTATION[_V2]/EXAM_AND_DIAGNOSTIC_FINDINGS at161301–161341. Care-card sources220073–220089. Evidence /private/tmp/scribblevet-gp-model-evidence-2026-11-18.json. No CT enum, structured GP vital-sign object, exact template fields, transcriptTs payload or private server prompts established. New GP field IDs and text-source provenance are ToothOps choices, not copied vendor schema. No vendor code/data is vendored or executed.

**Design:** Shared visit state remains canonical. Add bounded optional gpVitals/gpPhysicalExam/gpDiagnostics sources and an extensible gp-exam template/page using existing clinical forms. Consultation/discharge keep their existing fields; performed work uses treatmentReport. Header dictation controls open the same clinical modal pattern with listening/transcript/proposed sections, one primary action and 44px phone targets. Full-GP target can populate all relevant sections; narrower consultation/exam/discharge targets are explicit. Stop extraction produces editable, evidence-backed proposals; Apply requires unchanged source/visit/access and records a transcript source. CT capture appends only to CT and automatically triggers existing guarded refinement. Raw source transcripts stay in chart storage, not printed clinical/client reports or PDF stashes. English dental STT URLs, cleanup, prompts, request bodies and existing VoiceInputButton behavior remain untouched.

**Contracts:** ClinicalDictationKind = gp-visit|consultation|gp-exam|discharge|ct. ClinicalDictationSource = {id,kind,language,transcript,recordedAt,fields:string[]}; source transcript limit40000 chars, max20 sources/200000 total, reject rather than silently truncate. ChartSnapshot.clinicalDictations optional; existing chart hooks expose appendClinicalDictation. AI allowed PatientInfo fields = complaint, consultationHistory/Assessment/Plan, gpVitals/PhysicalExam/Diagnostics, treatmentReport, dischargeMedications/Instructions/FollowUp. Existing values and raw transcript treated as untrusted data; preserve doses/units/uncertainty, no new diagnoses, normal findings, meds or timing. AI returns unique sections {field,value,evidence}; evidence must occur in transcript. All user-facing strings t(), formal translations en/fr/de/it/es and pseudo coverage.

- [x] Implement GP optional fields/provenance persistence, normalization/reset/autosave and clinical output/PDF integration; keep transcript sources out of printed/PDF payloads.
- [x] Implement separately scoped clinical request/parser with bounded evidence-backed fields and unchanged dental voice snapshots.
- [x] Build shared clinical capture/review dialog and GP exam entry; CT append/auto-refine and consultation/discharge integration with patient/session/access guards.
- [x] Add replay fixtures and adversarial tests for all targets/languages, partial/malformed output, corrections, stale changes, consent/auth/session transitions and source round trips.
- [x] Independent review, full tests/build/translation checks, desktop/320/390 light/dark screenshots and explicit coverage/gaps. No deployment or migration unless independently required.

## Verification record

- Final full suite: 351 files / 4,735 tests passed (`/private/tmp/ct-gp-final-verified-tests.log`). Production build, store extension packaging and translation check passed; translations report `todo=0 remove=0`.
- Independent adversarial review covered source persistence/reset boundaries, output privacy, stale patient/session/auth/access guards, microphone cancellation/drain, append atomicity and clinical proposal parsing. Findings were fixed and regression-tested. Existing English dental voice snapshots pass unchanged.
- GP output is a clinician-reviewed proposal. Evidence matching verifies source excerpts occur in the transcript; it does not prove semantic entailment or live extraction quality.

### Visual coverage matrix

| Surface | States | Viewports/themes | Evidence |
| --- | --- | --- | --- |
| Clinical capture/review | Empty, typed, recording, preparing, proposals, evidence, applied, sources, error, stale, no content | 1440/390/320, light/dark | 66 captures, `/private/tmp/gp-clinical-visual.json` |
| Long proposal list | Middle and last fields, sticky actions | 1440/390/320, light/dark | 12 captures, `/private/tmp/gp-clinical-scroll-visual.json` |
| Consultation, GP examination, Discharge, Imaging | Empty, populated, long text/name, multiple visits, read-only | 1440/390/320, light/dark | 120 captures, `/private/tmp/gp-workspace-visual.json`; 30 GP recaptures after floating export removal, `/private/tmp/gp-workspace-final-visual.json` |
| Expanded section navigation | Multiple visits, selected GP examination, Escape restores focus | 390/320, light/dark | 4 captures, `/private/tmp/gp-navigation-visual.json` |
| Read-only GP record fields | Populated vitals, long examination, pending diagnostics | 1440/390/320, light/dark | 6 captures, `/private/tmp/gp-admin-visual.json` |
| Exported GP PDF | Populated vitals, examination and diagnostics grouped on one continuation; identity/footer/page count | Actual 3-page PDF, rendered final page | `/private/tmp/gp-visit-visual.pdf`, `/private/tmp/gp-visit-continuation.png` |

No horizontal overflow or browser page errors occurred in those matrices. Reviewed alignment, wrapping, density, focus restoration, action reachability and long-list scrolling. A phone floating export overlap was fixed; GP uses the inline Review clinical record action. PDF grouping was verified with a failing-then-passing page-count regression.

Remaining validation boundaries: native iOS runtime, physical microphone/Deepgram speech recognition, live AI extraction quality, real authenticated cloud/provider sessions, and OS-native select popups were not exercised. This is scoped CT/GP UI verification, not a full application UI review or a claim of exact private ScribbleVet backend parity. No deployment or schema migration is part of this change.
