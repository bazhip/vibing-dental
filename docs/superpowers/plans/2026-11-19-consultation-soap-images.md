# Consultation SOAP fields and images

- Write regressions for editable objective fields, evidence-backed dictation, note export, and the consultation image uploader.
- Reuse the existing seven consultation fields and visit-scoped image storage. Show Images below the note fields for every template and identify it in template previews.
- Keep clinical observations blank until documented. Retain existing template persistence and legacy English dictation requests.
- Update translated Help and capture a fictional consultation with image controls. Verify the web workspace at desktop, 390px, and 320px.

## Browser coverage

| Screen | Widths | States |
| --- | --- | --- |
| Consultation editor | 1440, 390, 320 | Light and dark, empty and populated, single and multiple visits, long patient name, editable and read-only visits |
| Images | 1440, 390, 320 | Empty and populated, sample upload, template switch, image actions open, uploader hidden on read-only visits |
| Template manager | 1440, 390, 320 | Built-in sample preview, long custom template name, Images listed |
| Consultation Help | 1440, 390, 320 | Direct link to the dictation and image instructions, current screenshot |

The browser checks used fictional visits and simulated image storage. Live storage and microphone services were outside this verification.
