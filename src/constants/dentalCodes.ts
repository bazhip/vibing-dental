/**
 * Catalog of dental shorthand codes and their definitions, aligned with the
 * official AVDC "Abbreviations for use in Case Logs" list (Nomenclature
 * Committee, revision dated 2023-11-30; retrieved from
 * https://avdc.org/wp-content/uploads/2023/12/abbreviations-2.pdf).
 * Equine/lagomorph-only abbreviations are omitted — this chart is dog/cat.
 * One entry per code so the autocomplete and the "codes used" PDF legend
 * can match each individually.
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

/** A clinical cluster of codes, mirroring how the AVDC list is organized.
 *  Surfaced as sub-headers in the reference panels. */
export interface DentalCodeGroup {
  name: string;
  kind: CodeKind;
  codes: DentalCode[];
}

const G = (name: string, codes: DentalCode[]): DentalCodeGroup => ({
  name,
  kind: codes[0].kind,
  codes,
});

export const DENTAL_CODE_GROUPS: DentalCodeGroup[] = [
  // ── Diagnoses ──────────────────────────────────────────────────────
  G('Occlusion', [
  D('MAL1', 'Class 1 malocclusion (neutroclusion)'),
  D('MAL2', 'Class 2 malocclusion (mandibular distoclusion)'),
  D('MAL3', 'Class 3 malocclusion (mandibular mesioclusion)'),
  D('MAL4', 'Class 4 malocclusion (asymmetrical skeletal malocclusion)'),
  D('MAL1/BV', 'Buccoversion'),
  D('MAL1/DV', 'Distoversion'),
  D('MAL1/LABV', 'Labioversion'),
  D('MAL1/LV', 'Linguoversion'),
  D('MAL1/MV', 'Mesioversion'),
  D('MAL1/PV', 'Palatoversion'),
  D('CB/C', 'Crossbite, caudal'),
  D('CB/R', 'Crossbite, rostral'),
  ]),
  G('Tooth number & eruption', [
  D('T/SN', 'Supernumerary tooth'),
  D('T/SR', 'Supernumerary root'),
  D('DT', 'Deciduous tooth'),
  D('DT/P', 'Persistent deciduous tooth'),
  D('T/A', 'Avulsed tooth'),
  D('T/E', 'Embedded tooth'),
  D('T/I', 'Impacted tooth'),
  D('T/LUX', 'Luxated tooth'),
  D('T/U', 'Unerupted tooth'),
  D('ATE', 'Abnormal tooth extrusion'),
  D('RCR', 'Retained crown-root'),
  D('RTR', 'Retained tooth root'),
  ]),
  G('Periodontal', [
  D('PD0', 'No periodontal disease (clinically normal)'),
  D('PD1', 'Gingivitis only (no attachment loss)'),
  D('PD2', 'Early periodontitis (<25% attachment loss)'),
  D('PD3', 'Moderate periodontitis (25–50% attachment loss)'),
  D('PD4', 'Advanced periodontitis (>50% attachment loss)'),
  D('GE', 'Gingival enlargement'),
  D('GR', 'Gingival recession'),
  D('GH', 'Gingival hyperplasia'),
  D('ABE', 'Alveolar bone expansion'),
  D('AOS', 'Alveolar osteitis'),
  ]),
  G('Tooth pathology', [
  D('TR', 'Tooth resorption'),
  D('RR', 'Internal resorption'),
  D('T/NV', 'Non-vital tooth'),
  D('T/V', 'Vital tooth'),
  D('T/PE', 'Pulp exposure'),
  D('T/NE', 'Near pulp exposure'),
  D('T/DIL', 'Dilaceration'),
  D('T/FDR', 'Fused roots'),
  D('PU/S', 'Pulp stone'),
  D('PU/M', 'Mineralization of pulp'),
  D('AT', 'Attrition'),
  D('AB', 'Abrasion'),
  D('ER', 'Erosion'),
  D('E/D', 'Enamel defect'),
  D('E/H', 'Enamel hypoplasia'),
  D('E/HM', 'Enamel hypomineralization'),
  D('CA', 'Caries'),
  ]),
  G('Tooth fracture', [
  D('T/FX', 'Tooth fracture'),
  D('T/FX/EI', 'Enamel infraction'),
  D('T/FX/EF', 'Enamel fracture'),
  D('T/FX/UCF', 'Uncomplicated crown fracture'),
  D('T/FX/CCF', 'Complicated crown fracture'),
  D('T/FX/UCRF', 'Uncomplicated crown-root fracture'),
  D('T/FX/CCRF', 'Complicated crown-root fracture'),
  D('T/FX/RF', 'Root fracture'),
  ]),
  G('Periapical & bone', [
  D('PA/P', 'Periapical pathology'),
  D('PA/A', 'Periapical abscess'),
  D('PA/C', 'Periapical cyst'),
  D('PA/G', 'Periapical granuloma'),
  D('OST', 'Osteomyelitis'),
  D('OSN', 'Osteonecrosis'),
  ]),
  G('Soft tissue & mucosa', [
  D('ST', 'Stomatitis'),
  D('ST/CS', 'Caudal stomatitis'),
  D('CU', 'Contact mucositis / contact mucosal ulceration'),
  D('CUS', 'Contact ulcerative stomatitis'),
  D('CL/B', 'Chewing lesion, buccal'),
  D('CL/L', 'Chewing lesion, lip'),
  D('CL/P', 'Chewing lesion, palate'),
  D('CL/T', 'Chewing lesion, tongue'),
  D('EOG', 'Eosinophilic granuloma'),
  D('EOG/L', 'Eosinophilic granuloma, lip'),
  D('EOG/P', 'Eosinophilic granuloma, palate'),
  D('EOG/T', 'Eosinophilic granuloma, tongue'),
  D('LAC/B', 'Laceration, buccal'),
  D('LAC/G', 'Laceration, gingiva/alveolar mucosa'),
  D('LAC/L', 'Laceration, lip'),
  D('LAC/P', 'Laceration, palatal mucosa'),
  D('LAC/T', 'Laceration, tongue'),
  D('FB', 'Foreign body'),
  D('SG/MUC/S', 'Sialocele, sublingual (ranula)'),
  D('SG/MUC/P', 'Sialocele, pharyngeal'),
  D('SG/MUC/C', 'Sialocele, cervical'),
  ]),
  G('Masses & oncology', [
  D('OM', 'Oral mass'),
  D('OM/SCC', 'Oral mass, squamous cell carcinoma'),
  D('OM/MM', 'Oral mass, malignant melanoma'),
  D('OM/FS', 'Oral mass, fibrosarcoma'),
  D('OM/AA', 'Oral mass, acanthomatous ameloblastoma'),
  D('OM/POF', 'Oral mass, peripheral odontogenic fibroma'),
  D('OM/PAP', 'Oral mass, papilloma'),
  D('OM/OS', 'Oral mass, osteosarcoma'),
  D('MET/R', 'Metastasis, regional'),
  D('MET/D', 'Metastasis, distant'),
  D('DTC', 'Dentigerous cyst'),
  D('LN/E', 'Lymph node enlargement'),
  ]),
  G('Jaw, TMJ & congenital', [
  D('MN/FX', 'Mandibular fracture'),
  D('MX/FX', 'Maxillary fracture'),
  D('SYM/S', 'Symphyseal separation'),
  D('TMJ/D', 'TMJ dysplasia'),
  D('TMJ/FX', 'TMJ fracture'),
  D('TMJ/LUX', 'TMJ luxation'),
  D('TMJ/A', 'TMJ ankylosis'),
  D('OMJL', 'Open-mouth jaw locking'),
  D('DMO', 'Decreased mouth opening'),
  D('MMM', 'Masticatory muscle myositis'),
  D('CMO', 'Craniomandibular osteopathy'),
  D('CFP', 'Cleft palate'),
  D('CFL', 'Cleft lip'),
  D('CFS', 'Cleft soft palate'),
  D('CFT', 'Traumatic cleft palate'),
  D('PDE', 'Acquired palate defect'),
  D('ONF', 'Oronasal fistula'),
  D('ESP', 'Elongated soft palate'),
  ]),

  // ── Procedures ─────────────────────────────────────────────────────
  G('Imaging & diagnostics', [
  P('RAD', 'Radiography'),
  P('CT', 'Computed tomography'),
  P('CT/CB', 'Cone-beam computed tomography'),
  P('MRI', 'Magnetic resonance imaging'),
  P('US', 'Ultrasonography'),
  P('B', 'Biopsy'),
  P('B/I', 'Biopsy, incisional'),
  P('B/E', 'Biopsy, excisional'),
  P('B/NA', 'Biopsy, needle aspiration'),
  P('B/P', 'Biopsy, punch'),
  P('CS', 'Culture / sensitivity'),
  ]),
  G('Periodontal treatment', [
  P('PRO', 'Professional dental cleaning (scaling, polishing, irrigation)'),
  P('GC', 'Gingival curettage'),
  P('RP/C', 'Closed root planing'),
  P('RP/O', 'Open root planing'),
  P('GV', 'Gingivoplasty / gingivectomy'),
  P('F', 'Flap'),
  P('F/AP', 'Apically repositioned flap'),
  P('F/CO', 'Coronally repositioned flap'),
  P('F/LA', 'Laterally positioned flap'),
  P('CR/L', 'Crown lengthening'),
  P('GF/B', 'Bone graft'),
  P('GF/CT', 'Connective tissue graft'),
  P('GF/F', 'Fat graft'),
  P('GF/G', 'Gingival graft'),
  P('GF/M', 'Mucosal graft'),
  P('GTR', 'Guided tissue regeneration'),
  P('FRE', 'Frenuloplasty (frenulotomy, frenulectomy)'),
  ]),
  G('Endodontics', [
  P('RCT', 'Standard root canal therapy'),
  P('RCT/S', 'Surgical root canal therapy'),
  P('AP/X', 'Apicoectomy'),
  P('VPT', 'Vital pulp therapy'),
  P('PCD', 'Direct pulp capping'),
  P('PCI', 'Indirect pulp capping'),
  P('APN', 'Apexification'),
  P('HS', 'Hemisection'),
  P('TS', 'Trisection'),
  P('T/XP', 'Partial tooth resection'),
  P('RO/X', 'Root resection / amputation'),
  P('CR/A', 'Crown amputation'),
  P('CR/XP', 'Crown reduction'),
  P('ODY', 'Odontoplasty'),
  ]),
  G('Restorative & prosthodontics', [
  P('R', 'Restoration'),
  P('R/A', 'Restoration, amalgam'),
  P('R/C', 'Restoration, composite'),
  P('R/CP', 'Restoration, compomer'),
  P('R/I', 'Restoration, glass ionomer'),
  P('PCB', 'Post-and-core build-up'),
  P('CR/P', 'Crown preparation'),
  P('CR/M', 'Metal crown (full)'),
  P('CR/PFM', 'Crown, porcelain fused to metal'),
  P('IM', 'Detailed imprint of hard and/or soft tissues'),
  P('IM/F', 'Full-mouth impression'),
  P('DC', 'Diagnostic cast'),
  P('BR', 'Bite registration'),
  P('IMP', 'Implant'),
  ]),
  G('Extractions', [
  P('X', 'Extraction, closed (no sectioning)'),
  P('XS', 'Extraction, closed with sectioning'),
  P('XSS', 'Extraction, open (surgical)'),
  P('XS/ODY', 'Removal of interproximal crown tissue to facilitate extraction'),
  P('ALV', 'Alveolectomy / alveoloplasty'),
  P('T/RI', 'Tooth reimplantation (avulsed tooth)'),
  P('T/RP', 'Tooth repositioning (luxated tooth)'),
  P('OP', 'Operculectomy'),
  ]),
  G('Oral surgery', [
  P('FB/R', 'Foreign body removal'),
  P('LAC/R', 'Laceration repair'),
  P('DTC/R', 'Dentigerous cyst removal'),
  P('ONF/R', 'Oronasal fistula repair'),
  P('CFP/R', 'Cleft palate repair'),
  P('CFL/R', 'Cleft lip repair'),
  P('CFS/R', 'Cleft soft palate repair'),
  P('CFT/R', 'Traumatic cleft palate repair'),
  P('PDE/R', 'Acquired palate defect repair'),
  P('ESP/R', 'Elongated soft palate reduction'),
  P('LIP/A/R', 'Lip avulsion repair'),
  P('S/P', 'Partial palatectomy'),
  P('S/M', 'Partial mandibulectomy'),
  P('S/MB', 'Bilateral partial mandibulectomy'),
  P('S/MD', 'Dorsal marginal mandibulectomy'),
  P('S/MS', 'Segmental mandibulectomy'),
  P('S/MT', 'Total mandibulectomy'),
  P('S/X', 'Partial maxillectomy'),
  P('S/XB', 'Bilateral partial maxillectomy'),
  P('LIN/X', 'Tongue resection'),
  P('LIP/X', 'Lip/cheek resection'),
  P('LN/X', 'Lymph node resection'),
  P('SG/X', 'Salivary gland resection'),
  P('TON/X', 'Tonsillectomy'),
  P('ZYG/X', 'Zygomectomy'),
  P('COR/X', 'Coronoidectomy'),
  P('CON/X', 'Condylectomy'),
  ]),
  G('Jaw fracture & TMJ repair', [
  P('SYM/R', 'Symphyseal repair'),
  P('FX/R', 'Jaw fracture repair'),
  P('FX/R/PL', 'Jaw fracture repair, plate'),
  P('FX/R/WIR/C', 'Cerclage wiring'),
  P('FX/R/WIR/OS', 'Intraosseous wiring'),
  P('FX/R/IDS', 'Interdental splinting'),
  P('FX/R/IAS', 'Interarch splinting'),
  P('FX/R/IQS', 'Interquadrant splinting'),
  P('FX/R/MMF', 'Maxillomandibular fixation'),
  P('FX/R/EXF', 'External skeletal fixation'),
  P('FX/R/MZ', 'Muzzling'),
  P('TMJ/FX/R', 'TMJ fracture repair'),
  P('TMJ/LUX/R', 'TMJ luxation reduction'),
  P('TMJ/A/R', 'TMJ ankylosis repair'),
  P('OMJL/R', 'Open-mouth jaw locking reduction'),
  ]),
  G('Orthodontics', [
  P('IP/AC', 'Inclined plane, acrylic'),
  P('IP/C', 'Inclined plane, composite'),
  P('IP/M', 'Inclined plane, metal'),
  P('OA/I', 'Ortho appliance, install'),
  P('OA/A', 'Ortho appliance, adjust'),
  P('OA/R', 'Ortho appliance, remove'),
  P('OA/BKT', 'Bracket, button or hook'),
  P('OA/EC', 'Ortho appliance, elastic'),
  P('OA/WIR', 'Ortho appliance, wire'),
  P('OC', 'Orthodontic counseling'),
  P('OR', 'Orthodontic recheck'),
  P('FT', 'Fiberotomy'),
  P('SR', 'Surgical repositioning'),
  P('BTH', 'Ball therapy'),
  ]),
];

/** Flat list, in group order — everything downstream (autocomplete,
 *  text scanning, PDF legend) derives from this. */
export const DENTAL_CODES: DentalCode[] = DENTAL_CODE_GROUPS.flatMap(
  (g) => g.codes
);

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
