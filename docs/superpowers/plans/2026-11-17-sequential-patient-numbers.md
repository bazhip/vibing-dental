# Sequential patient numbers and selected-tab visibility

- Keep permanent random patient keys; replace new display-code generation with a transactional database reservation. Scope counters to a practice, or the authenticated user for personal charts. Start at 1001 or above existing short numeric numbers. Reservations are idempotent by permanent patient key. Discarded drafts can leave gaps; never reuse reserved numbers.
- Before the number arrives, show Assigned automatically and allow a manual number. A failed reservation blocks saving a newly keyed patient with no number. Keep existing IDs unchanged. Delayed responses must not overwrite another chart or a manually entered number.
- Reveal the entire active tab using current element bounds after overflow controls render, on strip resize and when the same active tab is clicked. Clamp tab width to the strip and preserve its close control.
- Permit explicit saves during workspace autosave pause (needed by Save and close).
- Validate RPC security, sequence order and retry behavior in a temporary PostgreSQL engine. Run hook/unit tests, npm test, npm run build and browser geometry checks at desktop/390/320px.
- Rollout: apply 20261201_sequential_patient_numbers.sql before deploying the frontend. No production migration is applied as part of preparing the PR.
