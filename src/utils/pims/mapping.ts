import { matchField } from '../../extension/ezyvet/matchField';
import {
  recordNoteSectionHtml,
  recordNoteSectionText,
  plainTextToHtml,
  type RecordNote,
  type RecordNoteKey,
  type RecordNoteSection,
} from '../recordNote';

export type SourceKey = RecordNoteKey | 'chart';
/** `null` = don't send. `editedNote` is where a note that can't be split goes (unset = the
 *  treatment field's choice). */
export type PimsFieldMap = Partial<Record<SourceKey, string | null>> & { editedNote?: string | null };

/** The defaults with the saved choices over them. */
export type EffectiveFieldMap = Record<SourceKey, string | null> & { editedNote?: string | null };

export const DEFAULT_EZYVET_MAP: Record<SourceKey, string | null> = {
  header: null,
  anesthesia: 'Plan',
  exam: 'Physical Exam',
  findings: 'Physical Exam',
  procedures: 'Plan',
  radiographs: 'Physical Exam',
  treatment: 'Plan',
  recheck: 'Plan',
  chart: 'Discharge Summary',
};

export function effectiveMap(saved: PimsFieldMap | null): EffectiveFieldMap {
  return { ...DEFAULT_EZYVET_MAP, ...(saved ?? {}) };
}

export type FieldInfo = {
  title: string;
  kind: 'note' | 'popup' | 'email' | 'inPerson' | 'dischargeSummary';
  acceptsImage: boolean;
};

export function targetableFields(fields: FieldInfo[]): FieldInfo[] {
  return fields.filter((f) => f.kind !== 'email');
}

export type SendItem = { fieldTitle: string; text?: string; html?: string; pngDataUrl?: string };

/** Re-split a stored (possibly edited) note on its generated headings.
 *  Null unless every generated heading is found, in order. */
export function splitStoredNote(text: string, generated: RecordNote): RecordNote | null {
  // No headings to split on: the edited text would be lost, so the caller sends it whole.
  if (generated.sections.length === 0) return text.trim() === '' ? { sections: [] } : null;
  const lines = text.split(/\r?\n/);
  const sections: RecordNoteSection[] = [];
  let from = 0;
  const starts: number[] = [];
  for (const s of generated.sections) {
    const heading = s.heading.toLocaleUpperCase();
    const at = lines.findIndex((l, i) => i >= from && l === heading);
    if (at < 0) return null;
    starts.push(at);
    from = at + 1;
  }
  // Text typed above the first heading would be lost: let the caller send the note whole.
  if (lines.slice(0, starts[0]).some((l) => l.trim() !== '')) return null;
  generated.sections.forEach((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : lines.length;
    let body = lines.slice(starts[i] + 1, end);
    // sections are separated by one blank line
    if (i + 1 < starts.length && body[body.length - 1] === '') body = body.slice(0, -1);
    sections.push({ key: s.key, heading: s.heading, lines: body });
  });
  return { sections };
}

type Group = { fieldTitle: string; sections: RecordNoteSection[]; picture: boolean };

export function buildSendItems(args: {
  note: RecordNote | { editedText: string; field: string | null };
  map: Record<SourceKey, string | null>;
  fields: FieldInfo[];
  pngDataUrl: string | null;
}): { items: SendItem[]; unresolved: string[] } {
  const { note, map, fields, pngDataUrl } = args;
  const targets = targetableFields(fields);
  const titles = targets.map((f) => f.title);
  const unresolved: string[] = [];
  const miss = (wanted: string) => {
    if (!unresolved.includes(wanted)) unresolved.push(wanted);
  };
  const resolve = (wanted: string | null): string | null => {
    if (!wanted) return null;
    const title = matchField(wanted, titles);
    if (title == null) miss(wanted);
    return title;
  };

  const items: SendItem[] = [];
  const groups: Group[] = [];
  const groupFor = (title: string) => {
    let g = groups.find((x) => x.fieldTitle === title);
    if (!g) groups.push((g = { fieldTitle: title, sections: [], picture: false }));
    return g;
  };

  if ('editedText' in note) {
    const title = resolve(note.field);
    if (title) items.push({ fieldTitle: title, text: note.editedText, html: plainTextToHtml(note.editedText) });
  } else {
    for (const s of note.sections) {
      const title = resolve(map[s.key]);
      if (title) groupFor(title).sections.push(s);
    }
  }

  const chartWanted = pngDataUrl ? map.chart : null;
  const chartTitle = resolve(chartWanted);
  const chartField = chartTitle ? targets.find((f) => f.title === chartTitle) : undefined;
  if (chartField && !chartField.acceptsImage) miss(chartWanted!);
  const chartOk = !!chartField?.acceptsImage;

  const out: SendItem[] = [
    ...items,
    ...groups.map((g): SendItem => ({
      fieldTitle: g.fieldTitle,
      text: g.sections.map(recordNoteSectionText).join('\n\n'),
      html: g.sections.map(recordNoteSectionHtml).join(''),
    })),
  ];
  if (chartOk) {
    const existing = out.find((i) => i.fieldTitle === chartField!.title);
    if (existing) existing.pngDataUrl = pngDataUrl!;
    else out.push({ fieldTitle: chartField!.title, pngDataUrl: pngDataUrl! });
  }
  return { items: out, unresolved };
}
