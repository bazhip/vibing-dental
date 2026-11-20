# Consultation medication documentation

- Add regression tests for current use, administration, and medication decisions in a single review.
- Add medication fields beside History, Diagnostics and Plan in every consultation template. Keep existing saved template order and storage.
- Route documented medication details through consultation dictation and clinical note export. Keep legacy voice requests stable.
- Update the translated Help guide, capture a fictional visit, and verify desktop and phone layouts.

## Browser coverage

| Screen | Widths | States |
| --- | --- | --- |
| Consultation fields | 1440, 390, 320 | Empty, populated, long patient name, read-only, light and dark |
| Dictation review | 1440, 390, 320 | One fictional transcript, separate proposals, conditional plan, applying changes |
| Template manager | 1440, 390, 320 | Template switch, medication fields visible in the selected template |
| Clinical note | 1440, 390, 320 | All three medication sections appear after review |

Browser checks used a simulated AI response and no live microphone or practice data.
