# Dental-first visit types implementation plan

> **For agentic workers:** Use superpowers:executing-plans or superpowers:subagent-driven-development.

**Goal:** Add typed visits and one whole-visit dental dictation path, with each visit available in shared patient history and independently exportable.

**Architecture:** One visit record per chart ID. Store type with patient information inside each visit snapshot and project it into history metadata. Use the existing chart lifecycle and extension handoff. Dental is the fallback for legacy records. Route the microphone and export to the selected visit type.

**Spec:** docs/superpowers/specs/2026-11-19-dental-first-visit-types-design.md

- [x] Persist the visit type through cloud, browser and chart PDF restoration. Keep same-day duplicate checks type-aware.
- [x] Add the dental-first chooser and show labels in patient history. Keep GP authoring out of new visits.
- [x] Give consultations a standalone PDF and shared note export. Keep the extension scoped to the same saved visit.
- [x] Route dental dictation through every dental tab. Keep existing English request bytes and conflict review.
- [x] Verify the app, extension and screenshots at desktop, 390px and 320px, including a patient with both visit types.

## Browser coverage

All browser checks used fictional records at 1440, 390, and 320 CSS pixels in light and dark mode.

| Screen | States checked |
| --- | --- |
| Visit chooser | Dental selected by default, Consultation selected and created, keyboard selection, Escape and return to Patients |
| Dental workspace | Empty and populated visits, whole-visit recorder opened from Exam |
| Consultation | Empty and populated forms, standalone record note and PDF download, template preview and reorder coverage |
| Patients and history | Empty library, single visit, same-day visits of both types, long patient names, expanded row actions, notes and visit PDFs |
| Chrome extension | Exact consultation link, transfer and view-only states, refresh focus, PDF download |

The browser fixtures exercised app and extension UI with simulated services. The offline voice suite checks transcript and request compatibility. Live speech recognition, live AI extraction, native UI, and transfer to a connected practice system were outside this verification.
