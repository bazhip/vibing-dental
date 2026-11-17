import {
  plainTextToHtml,
  recordNoteHtml,
  recordNoteSectionHtml,
  recordNoteSectionText,
  recordNoteText,
  type RecordNote,
  type RecordNoteKey,
} from '../recordNote';
import { splitStoredNote } from './mapping';

export function buildCopyContent(note: RecordNote, storedText: string | null): {
  all: { text: string; html: string };
  sections: Array<{ key: RecordNoteKey; heading: string; text: string; html: string }>;
} {
  const source = storedText === null ? note : splitStoredNote(storedText, note);
  return {
    all: storedText === null
      ? { text: recordNoteText(note), html: recordNoteHtml(note) }
      : { text: storedText, html: plainTextToHtml(storedText) },
    sections: (source?.sections ?? []).map((section) => ({
      key: section.key,
      heading: section.heading,
      text: recordNoteSectionText(section),
      html: recordNoteSectionHtml(section),
    })),
  };
}

function pngBlob(dataUrl: string | null): Blob {
  const match = dataUrl?.match(/^data:image\/png;base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/);
  if (!match) throw new TypeError();
  const binary = atob(match[1]);
  if (btoa(binary) !== match[1]) throw new TypeError();
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < signature.length || signature.some((byte, index) => bytes[index] !== byte)) throw new TypeError();
  return new Blob([bytes], { type: 'image/png' });
}

export async function copyChartImage(render: () => Promise<string | null>): Promise<'copied' | 'unavailable' | 'failed'> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.clipboard?.write !== 'function' ||
        typeof ClipboardItem !== 'function' ||
        (typeof ClipboardItem.supports === 'function' && !ClipboardItem.supports('image/png'))) return 'unavailable';
    const image = Promise.resolve().then(render).then(pngBlob);
    void image.catch(() => undefined);
    const item = new ClipboardItem({ 'image/png': image });
    const written = navigator.clipboard.write([item]);
    await Promise.all([written, image]);
    return 'copied';
  } catch {
    return 'failed';
  }
}
