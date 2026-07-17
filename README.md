# Vibing Dental — Veterinary Dental Charting

A single-page React app for charting veterinary dental procedures. A tech or
DVM fills in the patient info, oral exam, anesthesia/nerve blocks, per-tooth
measurements, and tooth diagrams, then downloads a filled-in chart PDF on the
practice's template.

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

The app is gated behind a simple practice password (see
`src/components/Login.tsx`).

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

The site is served from the `docs/` folder (GitHub Pages style). To publish
a new build:

```bash
npm run build
rm -rf docs && cp -r build docs
git add docs && git commit
```

`package.json` sets `"homepage": "."` so the build uses relative asset
paths and works from any mount path. The reference chart PDFs
(`canine_chart.pdf`, `feline_chart.pdf`) also live in `docs/` — keep them
when refreshing the build.

## Feedback

Bugs and ideas: email bazhip@gmail.com (the in-app footer link pre-fills a
report template).
