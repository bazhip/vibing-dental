# Responsive Diagram Toolbar Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline.

**Goal:** Integrate secondary diagram tools into the toolbar when space permits and launch a local preview.
**Architecture:** Keep the existing DiagramView control tree, handlers and disclosure. Container queries expose its secondary controls inline on wide diagrams and preserve the compact panel on narrow ones.
**Tech Stack:** React, CSS container queries, Vite, Playwright.
**Spec:** docs/superpowers/specs/2026-11-18-diagram-toolbar-design.md

## Global constraints
Preserve translated labels, read-only restrictions, teal design tokens and 44px phone targets. No new screen, dependencies or copy. Work in the current checkout for local preview; do not commit.

## Review focus
Check both diagrams, long German labels, Draw settings, read-only controls, and resizing with an expanded panel. Visits and patient names do not affect this component's layout.

## Task 1: Responsive toolbar and preview
- [x] Modify src/components/EntryGrid.css: expose the existing extras as a compact inline group at sufficient diagram widths; give drawing and translations additional space; preserve the compact disclosure otherwise.
- [x] Update comments in src/components/DiagramView.tsx to describe responsive behavior.
- [x] Use Playwright to inspect screenshots at 1440, 390 and 320px, including expanded panels, Draw mode, read-only and translated labels. Assert no toolbar overflow and 44px phone targets.
- [x] Run npm test and npm run build. Expected: both pass.
- [x] Launch the Vite preview in the browser and provide its URL.

Validation: 277 test files / 2,874 tests pass. Build passes. Local Chrome checked editable/locked and Mark/Draw states in en/de at 1440/1100/390/320px, plus exact wide breakpoint edges in all five languages. Screenshots inspected for desktop, German Draw and 320px expanded disclosure. This is a focused toolbar review, not a full screen review.
