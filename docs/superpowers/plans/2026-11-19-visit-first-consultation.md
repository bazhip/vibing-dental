# Visit-first consultation implementation plan

> **For agentic workers:** Use superpowers:executing-plans or superpowers:subagent-driven-development.

**Goal:** Complete consultation documentation and handoff inside the existing visit.

**Architecture:** Pin a validated layout in patient information. Read and update a practice-scoped template library with version checks. Reuse the visit source form, clinical dictation, record note, document modal and Help Center.

**Tech stack:** React, TypeScript, Supabase PostgreSQL, Vitest.

**Spec:** docs/superpowers/specs/2026-11-19-visit-first-consultation-design.md

- [x] Test layout selection for legacy, new and pinned visits, validation, and stable record-note keys.
- [x] Implement built-in layouts and versioned practice persistence with member read and owner write.
- [x] Test and implement template selection, archived snapshots, locked visits, report review and private dictation sources.
- [x] Implement the template library, fictional preview and contextual guides in every app language.
- [x] Review diff and verify tests, build and browser states on desktop, 390px and 320px.

## Verification coverage

| Surface | Desktop | 390px | 320px |
| --- | --- | --- | --- |
| Consultation editor in light and dark, with empty and populated notes, long names and text, finalized visits, multiple visits and a late practice default | Checked | Checked | Checked |
| Template library in light and dark, with owner and member roles, load error, long names, options and fictional preview | Checked | Checked | Checked |
| Expanded saved transcript and direct record-note review in light and dark | Checked | Checked | Checked |
| All three localized Help Center guides in English, including image dimensions and direct links | Checked | Checked | Checked |
| Extension consultation action and note reload in writable and view-only states in light and dark | Checked | Checked | Checked |

The app fixture captured 108 states using fictional visits. The guides also passed narrow German and Arabic checks. The multiple-visit check verified the options and focus of the native select control. The operating-system popup itself was outside screenshot coverage. Automated extension tests cover saved layout order, copy, mapped paste, direct send and in-place reload. PostgreSQL tests cover ownership, membership removal, invalid data and concurrent edits. Browser fixtures used mock services. Native iOS and live PIMS transfers remain outside runtime coverage.
