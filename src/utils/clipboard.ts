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
): Promise<'rich' | 'plain' | 'prompt'> {
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
      return 'rich';
    } catch {
      /* fall through to plain text */
    }
  }
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return 'plain';
    } catch {
      /* fall through to the prompt */
    }
  }
  window.prompt(promptLabel, text);
  return 'prompt';
}
