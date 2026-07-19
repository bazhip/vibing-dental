/**
 * Distinguishes a deliberate sign-out from a session that expired out
 * from under the user. Supabase fires the same SIGNED_OUT event for
 * both; the menu's sign-out marks its intent here first, so App can
 * treat every unmarked SIGNED_OUT as an expiry — keep the chart
 * mounted and overlay a sign-in instead of ejecting to the landing
 * page mid-procedure.
 */

let explicit = false;

export function markExplicitSignOut(): void {
  explicit = true;
}

/** Read-and-clear: true only for the SIGNED_OUT the user asked for. */
export function consumeExplicitSignOut(): boolean {
  const was = explicit;
  explicit = false;
  return was;
}
