# Chinese and Arabic language support

Extend the full existing language experience to Simplified Chinese (`zh`, 简体中文; stated default while the optional script preference remained unanswered) and Modern Standard Arabic (`ar`, العربية): application UI, owner reports and client defaults, email, dictation, extension packaging, and database language validation.

Reuse existing native language selects and clinical teal/neutral components. Apply the established enterprise bidirectional layout pattern: Arabic navigation and form text read right to left; Chinese retains the current left-to-right layout. Keep anatomical diagrams, tooth-grid orientation, Triadan identifiers, codes, and numeric values in their established clinical order. Text mockup: Chinese `[Navigation] [Clinical workspace]`; Arabic `[Clinical workspace] [Navigation]`. Switching back restores LTR. User-written mixed-script content must remain readable.

Add complete catalogs with matching placeholders, Arabic's six plural forms, native clinical glossary values, and source metadata. Email direction follows the email language. Preserve all existing language behavior and frozen English voice snapshots. Use documented provider-supported speech models, native number cleanup and extraction examples, plus offline clinical fixtures.

PDFs require locally bundled licensed CJK/Arabic fonts, Arabic contextual shaping and mixed-direction text support, and wrapping of unspaced Chinese. Do not silently drop characters. Preserve existing-language PDFs and verify extracted text and rendered samples.

Validation: focused regression tests, full npm test/build, translation checks and email generation, voice replay, code review, and desktop/320/390px screenshots of relevant LTR/RTL screens, menus, chart data, and PDFs. Document gaps without claiming a full UI review. Follow the PR-and-migration workflow the user authorized for the preceding language addition, preserving independently deployed reminder logic. Email function redeployment remains a separate deployment action.
