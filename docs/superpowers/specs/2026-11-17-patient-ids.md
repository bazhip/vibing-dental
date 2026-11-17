# Generated patient IDs

Approved: new patients receive an editable generated patient number and a permanent internal patient key. The UI identifies generated numbers; changing the number does not split visit history. Existing records without IDs are left unchanged because name alone cannot establish identity. New visits carry the permanent key and displayed number. Existing manually entered numbers remain supported.

Use the existing patient-number input, with a small Auto-generated note when its value matches the generated number. Blank generated fields recover their generated value on blur and serialization. New blank charts must not become meaningful drafts merely because an ID was generated.

Store the internal key and original generated number in PatientInfo (the existing chart JSON). Metadata projections expose the key for grouping and visit queries. Legacy records retain their current identity behavior; no name-based backfill. Keep recall and prior-image lookups aligned with the same key.

Close dialogs offer Save and close, Close without saving, and Keep open. A save of an unnamed chart asks for its name. Failed saves retain the tab and images. Save of an inactive tab first preserves the current workspace and activates the target.
