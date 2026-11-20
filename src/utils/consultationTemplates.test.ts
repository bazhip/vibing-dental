import { describe, expect, it } from 'vitest';
import { NOTE_IMAGES_ID, noteTemplateSections, DENTAL_CONSULTATION, CONSULTATION_FIELDS, STANDARD_DISCHARGE, dischargeLayoutFor, changeConsultationLayout, insertImagingOutline, updatePracticeNoteField, consultationVisitSections, consultationChoices, consultationHeadings, consultationLayoutFor, normalizeConsultationLayout, parseConsultationLibrary } from './consultationTemplates';
import { normalizeVisitDocumentation } from './visitDocumentation';

const custom = { id: '11111111-1111-4111-8111-111111111111', name: 'Practice consult', fields: [...CONSULTATION_FIELDS].reverse() };

describe('consultation layouts', () => {
  it('uses the practice default for new blank consults and preserves the legacy order for existing notes', () => {
    const library = { defaultId: custom.id, templates: [custom] };
    expect(consultationLayoutFor({}, library)).toEqual(custom);
    expect(consultationLayoutFor({ complaint: 'Already entered on Patient' }, library)).toEqual(custom);
    expect(consultationLayoutFor({}, library, true).id).toBe('dental-v1');
    expect(consultationLayoutFor({ consultationHistory: 'Existing text' }, library, true).id).toBe('dental-v1');
  });

  it('keeps the visit copy after the practice edits or archives its template', () => {
    const patientInfo = normalizeVisitDocumentation({ consultationLayout: custom });
    const library = { defaultId: 'dental-v1', templates: [{ ...custom, name: 'New name', fields: CONSULTATION_FIELDS, archived: true }] };
    expect(consultationChoices(library).map(layout => layout.id)).not.toContain(custom.id);
    expect(consultationLayoutFor(patientInfo, library)).toEqual(custom);
  });

  it('keeps the earlier order pinned on a saved starter layout', () => {
    expect(normalizeConsultationLayout({ id: 'dental-v1', fields: CONSULTATION_FIELDS })).toEqual({
      id: 'dental-v1', fields: CONSULTATION_FIELDS,
    });
  });

  it('ignores imported layouts that would drop clinical sections and refuses corrupted library revisions', () => {
    const malformed = { ...custom, fields: CONSULTATION_FIELDS.map(() => 'complaint') };
    expect(normalizeConsultationLayout(malformed)).toBeUndefined();
    expect(normalizeConsultationLayout({ ...custom, name: '\u00a0\ufeff' })).toBeUndefined();
    expect(normalizeConsultationLayout({ ...custom, name: '🐾'.repeat(100) })?.name).toBe('🐾'.repeat(100));
    expect(parseConsultationLibrary({ defaultId: custom.id, templates: [malformed] })).toBeUndefined();
    expect(parseConsultationLibrary({ defaultId: custom.id, templates: [{ ...custom, archived: true }] })).toBeUndefined();
    expect(parseConsultationLibrary({ defaultId: custom.id, templates: [custom, custom] })).toBeUndefined();
  });
});

it('validates ordered custom sections and keeps their settings in a pinned layout', () => {
  const section = { id: 'consultationCustom_dental-example', label: 'Oral findings', guidance: 'Only visible findings', format: 'bullets' };
  const layout = { ...custom, sections: [section, { id: 'consultationPlan' }] };
  expect(normalizeConsultationLayout(layout)).toEqual(layout);
  expect(normalizeConsultationLayout({ ...layout, sections: [section, section] })).toBeUndefined();
  expect(normalizeConsultationLayout({ ...layout, sections: [{ id: 'patientName' }] })).toBeUndefined();
  expect(normalizeConsultationLayout({ ...layout, sections: [{ id: section.id }] })).toBeUndefined();
});

it('starts new dental consultations with dental-specific sections and keeps historical notes on the former layout', () => {
  expect(consultationLayoutFor({}).sections?.map(section => section.id)).toContain('consultationCustom_awake-oral-exam');
  expect(consultationLayoutFor({}, undefined, true).sections).toBeUndefined();
});

it('extracts unique headings from an example without importing its note body', () => {
  expect(consultationHeadings('# Dental history\nClient saw a dentist.\nPlan: Return in two weeks.\n# Dental history'))
    .toEqual(['Dental history', 'Plan']);
});

it('preserves retained section metadata after many template switches and ignores an independently invalid entry', () => {
  const retained = Array.from({ length: 300 }, (_, index) => ({
    id: `consultationCustom_section-${index}` as const, label: `Section ${index}`,
  }));
  const result = normalizeVisitDocumentation({
    consultationRetainedSections: [...retained, { id: 'consultationCustom_unlabeled' as const }],
  });
  expect(result.consultationRetainedSections).toEqual(retained);
});

it('rejects a valid-looking library larger than the database limit', () => {
  const text = '🐾'.repeat(950);
  const sections = Array.from({ length: 24 }, (_, index) => ({
    id: `consultationCustom_section-${index}` as const, label: `Section ${index}`, guidance: text, example: text, suggestedText: text,
  }));
  expect(parseConsultationLibrary({ defaultId: 'dental-v2', templates: [{ ...custom, sections }] })).toBeUndefined();
});

it('validates discharge fields independently and retains their owner-report choices when changing layouts', () => {
  const section = { id: 'dischargeCustom_call', label: 'When to call', ownerReport: true } as const;
  const layout = { id: custom.id, name: 'Recovery', fields: [], sections: [section] };
  const library = { version: 2, defaultId: layout.id, templates: [layout] };
  expect(parseConsultationLibrary(library, 'discharge')).toEqual(library);
  expect(parseConsultationLibrary({ ...library, templates: [{ id: layout.id, name: layout.name, fields: [] }] }, 'discharge')).toBeUndefined();
  expect(parseConsultationLibrary(library)).toBeUndefined();
  const visit = { dischargeLayout: layout, [section.id]: 'Call if concerned.' };
  const patch = changeConsultationLayout(visit, layout, STANDARD_DISCHARGE, 'discharge');
  expect(patch.dischargeRetainedSections).toEqual([section]);
  expect(consultationVisitSections({ ...visit, ...patch }, STANDARD_DISCHARGE, 'discharge')).toContainEqual(section);
});

it('recognizes existing inline and markdown imaging headings without changing their text', () => {
  const report = 'Findings: Recorded.\n## Technique\n**Impression：** Reviewed.';
  expect(insertImagingOutline(report, ['Findings', 'Technique', 'Impression'])).toBe(report);
  expect(insertImagingOutline(report, ['Comparison'])).toBe(report + '\n\nComparison:');
  const withCustom = insertImagingOutline(report, ['Findings: left side']);
  expect(insertImagingOutline(withCustom, ['Findings: left side'])).toBe(withCustom);
});

it('applies shared metadata edits to existing placements even when the field is archived', () => {
  const id = 'dischargeCustom_feeding' as const;
  const before = { id, label: 'Diet', archived: true } as const;
  const library = { defaultId: custom.id, practiceFields: [before], templates: [
    { ...custom, sections: [{ id, label: 'Diet', ownerReport: true as const }] },
    { ...custom, id: '22222222-2222-4222-8222-222222222222', sections: [{ id, label: 'Diet', format: 'bullets' as const }] },
  ] };
  const updated = updatePracticeNoteField(library, { ...before, label: 'Feeding' });
  expect(updated.practiceFields).toEqual([{ ...before, label: 'Feeding' }]);
  expect(updated.templates.map(template => template.sections?.[0])).toEqual([
    expect.objectContaining({ id, label: 'Feeding', ownerReport: true }),
    expect.objectContaining({ id, label: 'Feeding', format: 'bullets' }),
  ]);
});

it('defaults new discharge notes to Dental recovery and keeps legacy visits on Standard discharge', () => {
  expect(dischargeLayoutFor({}).id).toBe('dental-recovery-v1');
  expect(dischargeLayoutFor({}, undefined, true)).toEqual(STANDARD_DISCHARGE);
  expect(dischargeLayoutFor({}, { defaultId: 'discharge-v1', templates: [] })).toEqual(STANDARD_DISCHARGE);
});

it('reads edited Discharge starters and hides deleted starters without changing a pinned layout', () => {
  const standard = { ...STANDARD_DISCHARGE, name: 'Routine care', sections: [{ id: 'dischargeFollowUp' as const }] };
  const recovery = { id: 'dental-recovery-v1', name: 'Dental recovery', fields: [], sections: STANDARD_DISCHARGE.sections, archived: true };
  const raw = { version: 2, defaultId: standard.id, templates: [standard, recovery] };
  const library = parseConsultationLibrary(raw, 'discharge');
  expect(library).toBeDefined();
  expect(consultationChoices(library!, 'discharge')).toEqual([standard]);
  expect(dischargeLayoutFor({}, library)).toEqual(standard);
  expect(dischargeLayoutFor({ dischargeLayout: STANDARD_DISCHARGE }, library)).toEqual(STANDARD_DISCHARGE);
  expect(normalizeConsultationLayout(standard, 'discharge')).toEqual(standard);
  expect(parseConsultationLibrary({ ...raw, defaultId: recovery.id }, 'discharge')).toBeUndefined();
});

it('stores Imaging report field settings separately from report text and legacy outlines', () => {
  const settings = { version: 2, defaultId: 'imaging-v1', templates: [],
    imagingReportFields: { ct: { label: 'CT findings', starterText: 'Findings:\n' } },
  };
  expect(parseConsultationLibrary(settings, 'imaging')).toEqual(settings);
  expect(parseConsultationLibrary({ ...settings, imagingReportFields: { extra: {} } }, 'imaging')).toBeUndefined();
  expect(parseConsultationLibrary({ ...settings, imagingReportFields: { ct: { starterText: 'x'.repeat(4001) } } }, 'imaging')).toBeUndefined();
});

it('preserves named, typed Consult defaults in both the library and a saved visit layout', () => {
  const dental = { ...DENTAL_CONSULTATION, name: 'Dental intake', sections: [
    { id: 'complaint', inputType: 'multiselect', options: ['Pain', 'Follow-up'] },
  ] };
  const config = { version: 3, defaultId: dental.id, templates: [dental] };
  expect(parseConsultationLibrary(config)).toEqual(config);
  expect(normalizeConsultationLayout(dental)).toEqual(dental);
  expect(consultationChoices(parseConsultationLibrary(config)!)[0]).toEqual(dental);
  expect(parseConsultationLibrary({ ...config, version: 2 })).toBeUndefined();
  for (const section of [
    { id: 'gpVitals', inputType: 'shortText' },
    { id: 'complaint', inputType: 'radio', options: ['same', 'same'] },
    { id: 'complaint', inputType: 'multiselect', options: ['across\nlines'] },
    { id: 'complaint', inputType: 'radio' },
  ]) {
    expect(parseConsultationLibrary({ ...config, templates: [{ ...dental, sections: [section] }] })).toBeUndefined();
  }
});

it('keeps the implicit Consult gallery and preserves explicit placement or removal on template selection', () => {
  const gallery = { ...DENTAL_CONSULTATION, name: 'Dental intake', imagePlacement: { index: 0, label: 'Photos' } };
  const hidden = { ...gallery, imagePlacement: false as const };
  expect(noteTemplateSections(DENTAL_CONSULTATION, 'consultation').at(-1)?.id).toBe(NOTE_IMAGES_ID);
  expect(noteTemplateSections(gallery, 'consultation')[0]).toEqual({ id: NOTE_IMAGES_ID, label: 'Photos' });
  expect(noteTemplateSections(hidden, 'consultation').some(section => section.id === NOTE_IMAGES_ID)).toBe(false);
  expect(changeConsultationLayout({}, DENTAL_CONSULTATION, hidden).consultationLayout?.imagePlacement).toBe(false);
  expect(parseConsultationLibrary({ version: 4, defaultId: gallery.id, templates: [gallery] })?.templates[0]).toEqual(gallery);
  expect(parseConsultationLibrary({ version: 3, defaultId: gallery.id, templates: [gallery] })).toBeUndefined();
});
