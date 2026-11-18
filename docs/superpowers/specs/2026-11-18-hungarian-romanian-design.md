# Hungarian and Romanian

The user approved adding Hungarian (`hu`, Magyar) and Romanian (`ro`, Română) across the interface, dictation, owner reports, and emails.

Extend the existing locale catalogs and language registries. Keep the established native select interaction, as used by GitHub's settings: a sentence-case label above/beside a single select, with endonyms for each option. The text mockup is the existing language menu with `Magyar` and `Română` appended after `Español`; no component layout or styling changes are needed.

Translate all namespaces with formal address, preserve placeholders and clinical codes, add Romanian plural forms, and extend the clinical glossary. Keep client-facing defaults tied to the practice language. Extend the practice-language database constraint in a new migration and regenerate email assets.

Use a provider-supported speech model for each new language and add native cleanup, numbers, extraction examples, and offline fixtures. Preserve English voice snapshots. Deepgram's current language table supports hu/ro on general Nova-3, so use explicit monolingual hu/ro rather than an unsupported medical model.

PDFs must preserve Hungarian and Romanian diacritics. Embed licensed Unicode fonts for the new languages; retain existing fonts for other languages. Validate catalog completeness, switching and persistence, localized reports and emails, voice fixtures, full tests and build. Inspect translated screens at desktop and 320/390px widths. Real speech recognition and email delivery require live provider verification beyond local tests.

Alternative considered: interface-only support would omit the reports, emails, and dictation explicitly included in the user's approval. Reuse the existing i18next system rather than adding another translation mechanism.
