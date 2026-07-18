# ToothOps Charting — Veterinary Dental Charting

A single-page React app for charting veterinary dental procedures, live at
[toothops.app](https://toothops.app). A tech or DVM fills in the patient
info, oral exam, anesthesia/nerve blocks, per-tooth measurements, and tooth
diagrams, then downloads a filled-in chart PDF on the practice's template.
Cloud accounts (Supabase) add saved charts, visit history, team sharing,
photo/radiograph attachments, and recheck-reminder emails.

Architecture and infrastructure docs live in [`docs/`](docs/README.md).

## Features

- **Patient & exam forms** — patient info, presenting complaint, oral exam
  findings (normal/abnormal + comments), nerve block doses, and a free-text
  treatment report.
- **Charting grid** — spreadsheet-style entry of per-tooth measurements
  (mobility, recession, pocket, furcation, hyperplasia, calculus, gingivitis,
  PD state) with Excel-like keys: Tab/Shift+Tab move across cells, Enter
  commits and moves down a row, Escape cancels. Dental-code autocomplete pops
  up as you type. Column headers stay frozen below the topbar while you
  scroll.
- **Missing-tooth toggle** — each grid row has a "Missing" button that
  crosses out the row *and* fills the tooth in on the Diagnosis diagram (the
  two views share state, so marking a tooth on the diagram crosses out the
  grid row too, and missing teeth are locked in the Procedure diagram).
- **Tooth diagrams** — interactive Diagnosis (pre-surgery) and Procedure
  (post-surgery) diagrams: mark teeth missing/extracted, attach anchored
  comments, and draw freehand. Four dentitions: adult cat (30 teeth), adult
  dog (42), puppy (28), and kitten (26), all Triadan-numbered.
- **PDF export & reload** — generates the filled chart on the SoCal or VCA
  template (`pdf-lib`), with the diagrams rasterized in. Chart state is also
  embedded in the PDF, so a previously downloaded chart can be re-uploaded to
  restore the whole form.
- **Voice / AI autofill** — optional dictation (Deepgram) piped through
  Claude to fill the chart hands-free during a procedure. Requires API keys,
  configured in-app under AI settings.
- **Persistence** — everything autosaves to `localStorage`, so a refresh (or
  an accidental tab close) loses nothing. "New Chart" in the menu resets.

## Development

```bash
npm install
npm start        # dev server on http://localhost:3000
npm test         # jest suite
npm run build    # production build into build/
```

With `REACT_APP_SUPABASE_URL`/`ANON_KEY` set (committed `.env`, public
values) the app runs in cloud mode with real accounts. Without them it runs
standalone: a simple shared practice password (see
`src/components/Login.tsx`) and localStorage-only persistence — this is what
the jest suite uses.

### Code layout

```
src/
  EntryGrid.tsx        top-level layout: topbar, section rail, preview modal
  hooks/useChartState  single source of truth for all chart state
  components/          forms, charting grid, diagrams, modals
  constants/           tooth data, dental codes, diagram geometry
  utils/pdf*           PDF generation and re-parsing
public/diagrams/       per-species diagram artwork (SVG traced per tooth)
```

## Deployment

Vercel builds and serves the app from source on every push to `main` — no
manual deploy step. `package.json` sets `"homepage": "."` so the build uses
relative asset paths. (`docs/` used to hold a GitHub-Pages-style copy of the
build; it now holds documentation instead — don't copy builds there.)

See [`docs/infrastructure.md`](docs/infrastructure.md) for the full picture:
Supabase project, edge functions, email (Resend), and scheduled jobs.

## Feedback

Bugs and ideas: email bazhip@gmail.com (the in-app footer link pre-fills a
report template).
