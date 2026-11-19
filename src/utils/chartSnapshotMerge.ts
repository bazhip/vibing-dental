import type { ChartSnapshot } from '../types';

const conflict = Symbol('conflict');
type RecordValue = Record<string, unknown>;

/** JSONB can reorder object keys between a save and a read. */
function canonical(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
  });
}

const same = (left: unknown, right: unknown) => canonical(left) === canonical(right);

export function sameChartSnapshot(left: ChartSnapshot, right: ChartSnapshot): boolean {
  return same(left, right);
}

function mergeValue(base: unknown, local: unknown, remote: unknown): unknown {
  if (same(local, remote) || same(remote, base)) return local;
  if (same(local, base)) return remote;
  return conflict;
}

function mergeRecord(
  base: object, local: object, remote: object,
  resolve: (base: unknown, local: unknown, remote: unknown, key: string) => unknown = mergeValue,
): RecordValue | typeof conflict {
  const baseRecord = base as RecordValue;
  const localRecord = local as RecordValue;
  const remoteRecord = remote as RecordValue;
  const entries: [string, unknown][] = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    const value = resolve(baseRecord[key], localRecord[key], remoteRecord[key], key);
    if (value === conflict) return conflict;
    if (value !== undefined) entries.push([key, value]);
  }
  return Object.fromEntries(entries);
}

function mergeTeeth(base: ChartSnapshot['toothData'], local: ChartSnapshot['toothData'], remote: ChartSnapshot['toothData']) {
  const ids = base.map(tooth => tooth.triadan);
  if (!same(ids, local.map(tooth => tooth.triadan)) || !same(ids, remote.map(tooth => tooth.triadan))) return conflict;
  const teeth = base.map((tooth, index) => mergeRecord(tooth, local[index], remote[index]));
  return teeth.includes(conflict) ? conflict : teeth;
}

/** Merge edits with independent fields. Identity, clinical document arrays,
 * and chart lifecycle boundaries require an explicit conflict review. */
export function mergeChartSnapshots(base: ChartSnapshot, local: ChartSnapshot, remote: ChartSnapshot): ChartSnapshot | null {
  const identity = (value: ChartSnapshot) => {
    const patient = value.patientInfo;
    return [value.species, value.finalizedAt, patient.patientId, patient.patientName, patient.patientNumber, patient.date];
  };
  if (!same(identity(base), identity(local)) || !same(identity(base), identity(remote))) return null;

  const merged = mergeRecord(base, local, remote, (original, ours, theirs, key) => {
    const result = mergeValue(original, ours, theirs);
    if (result !== conflict) return result;
    if (key === 'patientInfo') return mergeRecord(base.patientInfo, local.patientInfo, remote.patientInfo);
    if (key === 'toothData') return mergeTeeth(base.toothData, local.toothData, remote.toothData);
    if (key === 'preMarks' || key === 'postMarks') {
      return mergeRecord(base[key] ?? {}, local[key] ?? {}, remote[key] ?? {});
    }
    return conflict;
  });
  return merged === conflict ? null : merged as unknown as ChartSnapshot;
}
