# Chart PDF export warning

Approved in conversation, including the autosave correction.

When downloading a chart PDF, warn if the active chart is unsaved or unfinalized. Keep downloading available without either action. Saved, finalized charts download immediately. Scope is the chart PDF, including native sharing and the explicit download-without-images path.

Reuse the existing clinical dialog and tokens. Follow GitHub's confirmation-dialog pattern: a status explanation followed by one primary corrective action and quiet alternatives. Example for both conditions:

```text
Before downloading
This chart has unsaved changes and has not been finalized.

[Finalize and download]
 Download anyway
 Cancel
```

Only show applicable actions and status text. Finalize uses the existing save-and-finalize operation. Hide unavailable cloud operations for local/trial charts. Failed or cancelled saves/finalization leave export pending, with retry and download-anyway available. Autosave remains the save mechanism; there is no separate save-only action. Guard against repeated taps, closing the preview, chart switches, and stale PDF bytes during asynchronous work.

## Approaches

A warning at preview opening would interrupt review and also affect other document tabs. A persistent banner would be easy to overlook. Use a warning at the actual chart download/share action to preserve the requested choice at the point it matters.

## Validation

Test clean/finalized, unsaved, unfinalized, combined, bypass, cancellation, failure, native sharing, and incomplete-image exports. Translate new strings into every enabled locale. Run npm test and npm run build. Inspect desktop and 320/390px phone screenshots for the warning and actions, including long content, busy and failure states; report any unavailable browser verification.
