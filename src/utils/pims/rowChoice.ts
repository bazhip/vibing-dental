import { matchField } from '../../extension/ezyvet/matchField';
import type { FieldInfo, SourceKey } from './mapping';

/** Row key: a note section, the chart picture, or the whole edited note. */
export type RowKey = SourceKey | 'edited';

export type MappingRow = { key: RowKey; label: string; options: FieldInfo[]; wanted: string | null };

export const DONT_SEND = '';
export const MISSING = '\u0000missing';

/** Choice shown in a row's select for the wanted title. */
export function selectValue(wanted: string | null, options: FieldInfo[]): string {
  if (wanted == null) return DONT_SEND;
  return matchField(wanted, options.map((f) => f.title)) ?? MISSING;
}
