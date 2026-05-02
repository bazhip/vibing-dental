/**
 * Catalog of dental shorthand codes and their definitions, taken from the
 * page-1 (diagnoses) and page-2 (procedures) legend tables in
 * latex/chart.tex. Multi-code rows in the source legend (e.g.
 *   "T/A, I, LUX → Tooth/avulsed, impacted, luxated")
 * are split into one entry per code so the autocomplete and the
 * "codes used" PDF legend can match each individually.
 */

export type CodeKind = 'diagnosis' | 'procedure';

export interface DentalCode {
  code: string;
  definition: string;
  kind: CodeKind;
}

const D = (code: string, definition: string): DentalCode => ({
  code,
  definition,
  kind: 'diagnosis',
});
const P = (code: string, definition: string): DentalCode => ({
  code,
  definition,
  kind: 'procedure',
});

export const DENTAL_CODES: DentalCode[] = [
  // ── Diagnoses ──────────────────────────────────────────────────────
  D('MAL/1', 'Malocclusion class 1'),
  D('MAL/2', 'Malocclusion class 2'),
  D('MAL/3', 'Malocclusion class 3'),
  D('MAL/4', 'Malocclusion class 4'),
  D('BV', 'Buccoversion'),
  D('DV', 'Distoversion'),
  D('LABV', 'Labioversion'),
  D('LV', 'Linguoversion'),
  D('MV', 'Mesioversion'),
  D('PV', 'Palatoversion'),
  D('CB/C', 'Crossbite, caudal'),
  D('CB/R', 'Crossbite, rostral'),
  D('T/SN', 'Supernumerary tooth'),
  D('T/SR', 'Supernumerary root'),
  D('DT', 'Deciduous tooth'),
  D('DT/P', 'Persistent deciduous tooth'),
  D('PD0', 'No periodontal disease (clinically normal)'),
  D('PD1', 'Gingivitis (no bone loss)'),
  D('PD2', 'Mild periodontitis (~25% attachment loss)'),
  D('PD3', 'Moderate periodontitis (25–50% attachment loss)'),
  D('PD4', 'Severe periodontitis (>50% attachment loss)'),
  D('GE', 'Gingival enlargement'),
  D('GR', 'Gingival recession'),
  D('GH', 'Gingival hyperplasia'),
  D('ST', 'Stomatitis'),
  D('ST/CS', 'Caudal stomatitis'),
  D('CU/ST/CS', 'Contact mucosal ulcer / mucositis'),
  D('OM', 'Oral mass'),
  D('DTC', 'Dentigerous cyst'),
  D('T/FX', 'Tooth fracture (EI/EF/UCF/CCF/UCRF/CCRF/RF)'),
  D('ABE', 'Alveolar bone expansion'),
  D('LN/E', 'Lymph node enlargement'),
  D('*SE', 'Super eruption'),
  D('*SI', 'Intrinsic staining'),
  D('AT/AB', 'Attrition / abrasion'),
  D('E/D', 'Enamel defection'),
  D('E/H', 'Enamel hypoplasia'),
  D('CA', 'Caries'),
  D('RTR', 'Retained tooth root or reserve crown'),
  D('T/A', 'Avulsed tooth'),
  D('T/I', 'Impacted tooth'),
  D('T/LUX', 'Luxated tooth'),
  D('T/NV', 'Non-vital tooth'),
  D('T/DIL', 'Dilaceration'),
  D('T/FDR', 'Fused roots'),
  D('T/U', 'Unerupted tooth'),
  D('CL/B', 'Chewing lesion, buccal'),
  D('CL/L', 'Chewing lesion, lip'),
  D('CL/P', 'Chewing lesion, palate'),
  D('CL/T', 'Chewing lesion, tongue'),
  D('FB', 'Foreign body'),
  D('LAC/B', 'Laceration, buccal'),
  D('LAC/L', 'Laceration, lip'),
  D('LAC/T', 'Laceration, tongue'),
  D('MN/FX', 'Mandibular fracture'),
  D('MX/FX', 'Maxillary fracture'),
  D('SYM/S', 'Symphyseal separation'),
  D('CFP', 'Cleft palate'),
  D('CFL', 'Cleft lip'),
  D('ONF', 'Oronasal fistula'),
  D('ESP', 'Elongated soft palate'),
  D('TMJ/D', 'TMJ dysplasia'),
  D('TMJ/FX', 'TMJ fracture'),
  D('TMJ/LUX', 'TMJ luxation'),
  D('PA/P', 'Periapical pathology'),

  // ── Procedures ─────────────────────────────────────────────────────
  P('RAD', 'Radiograph (Dental, CDR, CT, Plain Film)'),
  P('B/I', 'Biopsy, incisional'),
  P('B/E', 'Biopsy, excisional'),
  P('CS', 'Culture / Sensitivity'),
  P('PRO', 'Professional prophylaxis'),
  P('GC', 'Gingival curettage'),
  P('RP/C', 'Closed root planing'),
  P('RP/O', 'Open root planing'),
  P('GV', 'Gingivoplasty / gingivectomy'),
  P('F/AP', 'Apically repositioned flap'),
  P('F/CO', 'Coronally repositioned flap'),
  P('F/LA', 'Laterally positioned flap'),
  P('CR/L', 'Crown lengthening (Type 1, 2, 3)'),
  P('GF/B', 'Bone graft'),
  P('GTR', 'Guided tissue regeneration'),
  P('GF/G', 'Gingival graft'),
  P('SPL/AC', 'Splint, acrylic'),
  P('SPL/C', 'Splint, composite'),
  P('SPL/W/R', 'Splint, wire-reinforced'),
  P('RCT', 'Standard root canal therapy'),
  P('RCT/S', 'Surgical root canal therapy'),
  P('TRX', 'Tooth partial resection (hemisection)'),
  P('CR/A', 'Crown amputation'),
  P('CR/XP', 'Crown reduction'),
  P('VPT', 'Vital pulp therapy'),
  P('PCD', 'Direct pulp capping'),
  P('PCI', 'Indirect pulp capping'),
  P('CRA', 'Crown amputation (alternate)'),
  P('APN', 'Apexification'),
  P('APG', 'Apexogenesis'),
  P('R', 'Restoration'),
  P('R/C', 'Restoration, composite'),
  P('R/I', 'Restoration, glass ionomer'),
  P('R/A', 'Restoration, amalgam'),
  P('IMP', 'Implant'),
  P('F', 'Flap'),
  P('X', 'Extraction, closed (no sectioning)'),
  P('XS', 'Extraction, closed w/ sectioning'),
  P('XSS', 'Extraction, open'),
  P('ALV', 'Alveolectomy / alveoloplasty'),
  P('ONF/R', 'Oronasal fistula repair'),
  P('CFP/R', 'Cleft palate repair'),
  P('CFL/R', 'Cleft lip repair'),
  P('S/P', 'Palate surgery'),
  P('S/M', 'Mandibulectomy (partial)'),
  P('S/X', 'Maxillectomy (partial)'),
  P('FRE', 'Frenoplasty'),
  P('SYM/R', 'Symphyseal repair'),
  P('FX/R', 'Jaw fracture repair'),
  P('FX/R/PL', 'Jaw fracture repair, plate'),
  P('FX/R/S', 'Jaw fracture repair, screw'),
  P('FX/R/WIR', 'Jaw fracture repair, wire'),
  P('FX/R/WIR/C', 'Jaw fracture repair, cerclage wire'),
  P('FX/R/WIR/ID', 'Jaw fracture repair, interdental wire'),
  P('FX/R/WIRE/OS', 'Jaw fracture repair, osseous wire'),
  P('FX/R/WIR/IDS', 'Splinting (interdental wire)'),
  P('FX/R/MMF', 'Maxillary–mandibular fixation'),
  P('CON/X', 'Condylectomy'),
  P('LUX/R', 'TMJ luxation reduction'),
  P('CBU', 'Core build-up'),
  P('CR/P', 'Crown preparation'),
  P('CR/M', 'Crown, metal'),
  P('CR/PFM', 'Crown, porcelain fused to metal'),
  P('IMF', 'Impressions, full mouth'),
  P('IP/AC', 'Inclined plane, acrylic'),
  P('IP/C', 'Inclined plane, composite'),
  P('IP/M', 'Inclined plane, metal'),
  P('OA/I', 'Ortho appliance, install'),
  P('OA/A', 'Ortho appliance, adjust'),
  P('OA/R', 'Ortho appliance, remove'),
  P('OA/BKT', 'Ortho appliance, bracket'),
  P('OA/BU', 'Ortho appliance, button'),
  P('OA/EC', 'Ortho appliance, elastic'),
  P('OA/WIR', 'Ortho appliance, wire'),
];

export const CODES_BY_CODE: Record<string, DentalCode> = Object.fromEntries(
  DENTAL_CODES.map((c) => [c.code, c])
);

/** Codes sorted longest-first so a substring scanner picks `T/FX` before `T`. */
export const DENTAL_CODES_BY_LENGTH: DentalCode[] = [...DENTAL_CODES].sort(
  (a, b) => b.code.length - a.code.length
);

/** Find every code that occurs in a piece of free text. Codes are matched as
 *  whole tokens (left-bounded by start/non-code-char, right-bounded by
 *  end/non-code-char) so `PD3.` and `(T/FX)` both match while `MAL/15` does
 *  not match `MAL/1`. */
export function findCodesInText(text: string): DentalCode[] {
  if (!text) return [];
  const found = new Set<string>();
  // A "code char" is a letter, digit, slash, or asterisk — i.e. any
  // character that can appear inside a code like *SE or T/FX.
  const codeCharRe = /[A-Za-z0-9/*]/;
  for (const c of DENTAL_CODES_BY_LENGTH) {
    const lc = text;
    let from = 0;
    while (from <= lc.length - c.code.length) {
      const idx = lc.indexOf(c.code, from);
      if (idx < 0) break;
      const before = idx > 0 ? lc[idx - 1] : '';
      const after = idx + c.code.length < lc.length ? lc[idx + c.code.length] : '';
      if (!codeCharRe.test(before) && !codeCharRe.test(after)) {
        found.add(c.code);
        break;
      }
      from = idx + 1;
    }
  }
  return Array.from(found)
    .map((code) => CODES_BY_CODE[code])
    .filter(Boolean);
}

/** Codes whose `code` starts with `prefix` (case-sensitive). */
export function codesMatchingPrefix(prefix: string, limit = 8): DentalCode[] {
  if (!prefix) return [];
  const out: DentalCode[] = [];
  for (const c of DENTAL_CODES) {
    if (c.code.startsWith(prefix)) {
      out.push(c);
      if (out.length >= limit) break;
    }
  }
  return out;
}
