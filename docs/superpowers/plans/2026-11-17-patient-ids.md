# Patient identity and save-on-close implementation

1. Add pure patient-ID generation/default helpers and tests; extend optional PatientInfo metadata. Integrate new-patient and new-visit creation, blank-content detection, snapshot normalization, and PIMS replacement of generated values.
2. Reuse stable patient keys in library grouping, tab grouping, visit queries, prior-image lists, and recall matching. Preserve legacy fallback. Test same-name pets, renamed display IDs and inherited visit IDs.
3. Add localized Auto-generated field hint with current shared form styles. Verify web/mobile layouts and manual editing.
4. Add Save and close to the existing choice dialog, including name prompting and failure/cancellation protection. Test active/inactive save and image preservation.
5. Run focused tests, full npm test, npm run build, and desktop/390/320 browser checks. Create a new PR based on merged #111, documenting legacy-data limits and any backend migration.
