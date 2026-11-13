import { CustomAnesthesia, CustomBlockValue, CustomFieldType, CustomFieldValue } from '../types';
import i18n from '../i18n';

/** Default labels for unnamed entries, in `lng`. English by default: these
 *  labels are saved into the chart (and printed), and the clinical-record
 *  language is decided later (plan 3), not by the UI language. */
const labels = (lng = 'en') => {
  const t = i18n.getFixedT(lng, 'chart');
  return { block: t('customAnesthesia.block'), field: t('customAnesthesia.field'), yes: t('customAnesthesia.yes') };
};

/**
 * Custom anesthesia fields.
 *
 * Definitions are per person (chart settings): custom nerve blocks (extra
 * Right/Left mL rows) and custom fields (text, number with a unit,
 * yes/no, or a pick-list). Values live on the chart, each carrying its
 * label/type/unit — so a chart shows its custom entries to anyone (a
 * colleague, the PDF, the admin viewer), and deleting a definition never
 * deletes charted data.
 */

export interface CustomBlockDef { id: string; label: string }
export interface CustomFieldDef {
  id: string;
  label: string;
  type: CustomFieldType;
  /** Number fields: e.g. "mL", "mg/kg", "mm". */
  unit?: string;
  /** Pick-list options (select fields). */
  options?: string[];
}

export const MAX_CUSTOM_BLOCKS = 10;
/** Kept small so a person's settings stay under the database's 8 KB cap
 *  for chart preferences, even with full pick-lists. */
export const MAX_CUSTOM_FIELDS = 15;
export const MAX_SELECT_OPTIONS = 12;
const TYPES = new Set<CustomFieldType>(['text', 'number', 'checkbox', 'select']);

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export function newCustomId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Tolerant read of block definitions (settings). Unnamed ones dropped. */
export function normalizeBlockDefs(raw: unknown): CustomBlockDef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomBlockDef[] = [];
  for (const r of raw) {
    const o = obj(r);
    const id = str(o?.id, 40);
    const label = str(o?.label, 40);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label });
  }
  return out.slice(0, MAX_CUSTOM_BLOCKS);
}

/** Tolerant read of field definitions (settings). */
export function normalizeFieldDefs(raw: unknown): CustomFieldDef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomFieldDef[] = [];
  for (const r of raw) {
    const o = obj(r);
    const id = str(o?.id, 40);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const type = TYPES.has(o?.type as CustomFieldType) ? (o!.type as CustomFieldType) : 'text';
    const def: CustomFieldDef = { id, label: str(o?.label, 40), type };
    if (type === 'number') { const u = str(o?.unit, 12); if (u) def.unit = u; }
    if (type === 'select') {
      def.options = Array.isArray(o?.options)
        ? (o!.options as unknown[]).map((x) => str(x, 30)).filter(Boolean).slice(0, MAX_SELECT_OPTIONS)
        : [];
    }
    out.push(def);
  }
  return out.slice(0, MAX_CUSTOM_FIELDS);
}

/** Tolerant read of a chart's custom values. */
export function normalizeCustomAnesthesia(raw: unknown): CustomAnesthesia {
  const o = obj(raw);
  const blocks: CustomBlockValue[] = Array.isArray(o?.blocks)
    ? (o!.blocks as unknown[]).map(obj).filter(Boolean).map((b) => ({
        id: str(b!.id, 40), label: str(b!.label, 40), right: str(b!.right, 12), left: str(b!.left, 12),
      })).filter((b) => b.id)
    : [];
  const fields: CustomFieldValue[] = Array.isArray(o?.fields)
    ? (o!.fields as unknown[]).map(obj).filter(Boolean).map((f) => {
        const type = TYPES.has(f!.type as CustomFieldType) ? (f!.type as CustomFieldType) : 'text';
        const v: CustomFieldValue = { id: str(f!.id, 40), label: str(f!.label, 40), type, value: str(f!.value, 500) };
        const unit = str(f!.unit, 12);
        if (unit) v.unit = unit;
        return v;
      }).filter((f) => f.id)
    : [];
  return { blocks, fields };
}

const blockFilled = (b: CustomBlockValue) => !!(b.right.trim() || b.left.trim());
const fieldFilled = (f: CustomFieldValue) => !!f.value.trim();

/** Rows to show on the Anesthesia page: the person's blocks (with this
 *  chart's doses), then any other blocks this chart has doses for. */
export function blocksForForm(defs: CustomBlockDef[], chart: CustomAnesthesia | undefined): CustomBlockValue[] {
  const values = chart?.blocks ?? [];
  const byId = new Map(values.map((b) => [b.id, b]));
  const unnamed = labels().block;
  const rows = defs.map((d) => {
    const v = byId.get(d.id);
    return { id: d.id, label: d.label || v?.label || unnamed, right: v?.right ?? '', left: v?.left ?? '' };
  });
  const own = new Set(defs.map((d) => d.id));
  return [...rows, ...values.filter((b) => !own.has(b.id) && blockFilled(b))];
}

/** Fields to show: the person's fields (with this chart's values), then
 *  any other fields this chart has values for. Definitions carry the
 *  pick-list options; charted-only fields show as read-only text. */
export function fieldsForForm(
  defs: CustomFieldDef[],
  chart: CustomAnesthesia | undefined,
): Array<{ value: CustomFieldValue; def?: CustomFieldDef }> {
  const values = chart?.fields ?? [];
  const byId = new Map(values.map((f) => [f.id, f]));
  const unnamed = labels().field;
  const rows = defs.map((d) => {
    const v = byId.get(d.id);
    return {
      def: d,
      value: { id: d.id, label: d.label || v?.label || unnamed, type: d.type, unit: d.unit, value: v?.value ?? '' } as CustomFieldValue,
    };
  });
  const own = new Set(defs.map((d) => d.id));
  return [...rows, ...values.filter((f) => !own.has(f.id) && fieldFilled(f)).map((value) => ({ value }))];
}

/** The chart after one block's doses change; empty entries are dropped. */
export function setBlockValue(chart: CustomAnesthesia | undefined, row: CustomBlockValue): CustomAnesthesia {
  const cur = chart ?? { blocks: [], fields: [] };
  const others = cur.blocks.filter((b) => b.id !== row.id);
  return { ...cur, blocks: blockFilled(row) ? [...others, row] : others };
}

/** The chart after one field's value changes; empty entries are dropped. */
export function setFieldValue(chart: CustomAnesthesia | undefined, field: CustomFieldValue): CustomAnesthesia {
  const cur = chart ?? { blocks: [], fields: [] };
  const others = cur.fields.filter((f) => f.id !== field.id);
  return { ...cur, fields: fieldFilled(field) ? [...others, field] : others };
}

/** PDF: custom blocks with a dose, in the order entered. */
export function filledBlocks(chart: CustomAnesthesia | undefined): CustomBlockValue[] {
  return (chart?.blocks ?? []).filter(blockFilled);
}

/** PDF / viewer: "Label: value unit" for each filled field. English by
 *  default: the PDF and the operator viewer are not translated yet. */
export function fieldLines(chart: CustomAnesthesia | undefined, lng = 'en'): string[] {
  const l = labels(lng);
  return (chart?.fields ?? []).filter(fieldFilled).map((f) => {
    const v = f.type === 'checkbox' ? l.yes : `${f.value}${f.type === 'number' && f.unit ? ` ${f.unit}` : ''}`;
    return `${f.label || l.field}: ${v}`;
  });
}
