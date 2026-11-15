// Matches a requested section name to one of ezyVet's page field names.

const SYNONYM_GROUPS: string[][] = [
  ['subjective', 'history'],
  ['objective', 'physical exam', 'exam'],
];

function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/[?:;.!]+$/, '').trim();
}

function singular(s: string): string {
  if (s.length > 3 && s.endsWith('ies')) return `${s.slice(0, -3)}y`;
  if (s.length > 3 && s.endsWith('es')) return s.slice(0, -2);
  if (s.length > 2 && s.endsWith('s')) return s.slice(0, -1);
  return s;
}

function areSynonyms(a: string, b: string): boolean {
  return SYNONYM_GROUPS.some((g) => g.includes(a) && g.includes(b));
}

function arePlurals(a: string, b: string): boolean {
  if (singular(a) === singular(b)) return true;
  // "es" stripping is wrong for words like "plates"; also try plain "s" removal.
  const plain = (s: string) => (s.endsWith('s') ? s.slice(0, -1) : s);
  return plain(a) === plain(b);
}

const TIERS: Array<(a: string, b: string) => boolean> = [
  (a, b) => a === b,
  areSynonyms,
  arePlurals,
];

function segmentsOf(name: string): string[] {
  return name.split(/[>/]/).map(normalise).filter(Boolean);
}

// First field matching under the earliest tier that has any match.
function firstByTier(wanted: string, candidates: Array<{ key: string; index: number }>): number | null {
  for (const same of TIERS) {
    const hit = candidates.find((c) => same(wanted, c.key));
    if (hit) return hit.index;
  }
  return null;
}

export function matchField(wanted: string, available: string[]): string | null {
  const want = normalise(wanted);
  if (!want) return null;
  const parsed = available.map((name, index) => ({ index, segs: segmentsOf(name), full: normalise(name) }));

  const whole = firstByTier(want, parsed.map((p) => ({ key: p.full, index: p.index })));
  if (whole !== null) return available[whole];

  const compound = parsed.filter((p) => p.segs.length > 1);
  const leaf = firstByTier(want, compound.map((p) => ({ key: p.segs[p.segs.length - 1], index: p.index })));
  if (leaf !== null) return available[leaf];

  const parents = compound.filter((p) => p.segs.slice(0, -1).some((s) => TIERS[0](want, s)));
  return parents.length === 1 ? available[parents[0].index] : null;
}
