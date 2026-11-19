/**
 * Copy text that pastes well everywhere: rich HTML (bold headings) where
 * the target accepts it, plain text otherwise. Practice software differs
 * in what its note fields take, so both flavours go on the clipboard.
 * Falls back to plain text, then to a prompt the user can copy from.
 */
export async function copyRichText(
  html: string,
  text: string,
  promptLabel: string,
  isCurrent?: () => boolean,
): Promise<'rich' | 'plain' | 'prompt'> {
  const requireCurrent = () => { if (isCurrent && !isCurrent()) throw new DOMException('', 'AbortError'); };
  requireCurrent();
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  const Item = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  if (clipboard?.write && Item) {
    try {
      await clipboard.write([
        new Item({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      requireCurrent();
      return 'rich';
    } catch {
      /* fall through to plain text */
    }
  }
  requireCurrent();
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      requireCurrent();
      return 'plain';
    } catch {
      /* fall through to the prompt */
    }
  }
  requireCurrent();
  window.prompt(promptLabel, text);
  return 'prompt';
}
