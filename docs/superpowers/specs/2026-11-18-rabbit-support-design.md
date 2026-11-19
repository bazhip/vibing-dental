# Rabbit support design

Approved in conversation on 2026-11-18.

Add an adult rabbit chart with 28 teeth: maxillary quadrants 01, 02, 06–11; mandibular quadrants 01, 07–11. Draw an original SVG guided by the supplied occlusal reference, with small palatal peg incisors, long curved incisors, a long diastema and six upper/five lower cheek teeth per side. Patient right appears at viewer left. Each tooth has a closed selection/mark outline. Rabbit teeth have no divided roots for per-root pocket entry.

Use the existing Canine/Feline choices and a compact Other selector containing Equine and Rabbit, following GitHub compact disclosure placement. Selected state shows Other: Rabbit/Equine. Preserve shared clinical tokens, teal accents, neutral surfaces, 44px phone controls, keyboard access and native-app support. Adult charts only for rabbit/equine.

## Approaches
Extend the existing Species/data/diagram/PDF pipeline (chosen), rather than adding a separate rabbit screen (duplicates workflows) or using feline geometry (clinically wrong). Keep SVG vector art and matching tooth hit geometry together via a reproducible generator, as for equine.

Include storage identity, chart filters, record notes, PDF export/import, translations in every enabled language and rabbit-specific report defaults. Preserve English voice snapshots. Validate with anatomical and interaction tests, full npm test/build, and screenshots at desktop, 390px and 320px with populated/empty data, long names and open selector. This is a schematic clinical chart, not diagnostic imaging.
