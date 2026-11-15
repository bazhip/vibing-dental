/** The slice of useCloudSync this needs (read fresh after the save). */
export interface SaveState {
  enabled: boolean;
  dirty: boolean;
  /** '' = the chart has never reached the cloud. */
  lastSavedAt: string;
  saveNow: () => Promise<void>;
}

/**
 * Make sure the cloud holds the chart as it is on screen — e.g. before the
 * server emails the owner at the chart's *saved* owner email. Saves when
 * needed and reports whether the chart really is saved afterwards: a save
 * can throw (offline) or quietly do nothing (duplicate question declined).
 * `get` must return the latest state, so read it through a ref.
 */
export async function ensureChartSaved(get: () => SaveState, onDeliberateSave?: () => void): Promise<boolean> {
  if (!get().enabled) return false;
  if (get().dirty || !get().lastSavedAt) {
    onDeliberateSave?.();
    try {
      await get().saveNow();
    } catch {
      return false;
    }
    // Let React commit the save's state updates before reading them back.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const after = get();
  return !after.dirty && !!after.lastSavedAt;
}
