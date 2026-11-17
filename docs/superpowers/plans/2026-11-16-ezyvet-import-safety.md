# ezyVet Import Safety Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Do not mix broader PIMS parity work into these fixes.

**Goal:** Fix the three import risks reproduced during the ScribbleVet v1.31.3 audit and approved by the owner.

**Architecture:** Keep the existing adapter and handover protocol. Require Day-view readiness before setting the target calendar date, construct timestamps using local wall-clock components, and create an inert tab whose patient payload is stored before navigation to ToothOps.

**Tech Stack:** TypeScript, Chrome extension APIs, Vitest, jsdom.

**Spec:** Owner-approved findings in the November 16, 2026 audit: calendar readiness, daylight-saving timestamps, and destination-before-storage race.

## Global Constraints

- Work only in the isolated `feat/pims-extension-parity` worktree; leave other sessions untouched.
- Preserve tab-bound, expiring handovers, account checks, and patient-free URLs.
- Use existing localized error presentation; do not expose raw diagnostic strings.
- Run `npm test` and `npm run build` before any commit or merge.

## Review Focus

- Missing or ineffective Day controls must not import Week-view appointments.
- A delayed Day transition may replace the date input; use the current input after readiness.
- Both daylight-saving boundaries must preserve the supplied local appointment time.
- The destination must not run before its payload has been stored successfully.
- Storage or navigation failures must not leave consumable orphaned patient payloads.

## Tasks

- [x] Add regression tests and verify they fail for calendar readiness, both DST boundaries, and handover ordering/failure cleanup.
- [x] Implement the minimal readiness, timestamp, and store-before-navigation changes.
- [x] Run focused tests, full tests, build, and extension packaging checks; review the diff.

## Verification — November 16, 2026

- Full suite: 257 files, 2,673 tests passed.
- `npm run build`: passed, including translation validation, lint and TypeScript checks.
- Development and store extension builds: passed; both contain `pims-page.js`, the compatibility bridge and side panel. Store messaging remains restricted to `https://toothops.app/*`; no debugger/native permissions added.
- Follow-up adversarial review reproduced and closed ezyVet asynchronous/reentrant encounter-switch races and stale calendar refresh reads. A refreshed empty day fails closed without independent render-completion evidence.
- Broader implementation scope, fixture-only validation and live-verification blockers are recorded in `docs/scribblevet-extension-parity.md`; full ScribbleVet parity is not established.

## Separate Follow-up

Inventory the shipped extension's actual read/write handlers and backend/native dependencies before proposing full extension parity. Backend enum members and permissions alone do not establish working support. New integrations need a reviewed design and fixture-backed validation, not guessed selectors or copied proprietary source.
