# Medication lookup and import

- Verify medication carry-forward uses the same patient’s latest prior consultation and presents the source date and recorded medication changes.
- Add a review-and-copy action for an empty current list and a drug-name-only DailyMed lookup.
- Update localized consultation Help and verify the controls at desktop and phone widths.

## Verification

| Screen | Widths | States |
| --- | --- | --- |
| Current medications | 1440, 390, 320 | Light and dark, empty history, long patient name, read-only visit, lookup expanded, prior list expanded, copy and keyboard focus |
| Consultation Help | 1440, 390, 320 | Direct link, new screenshot, medication lookup and copy instructions |

The browser exercised fictional charts and a simulated history service. The DailyMed query was verified separately with a public drug name.
