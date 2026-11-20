import { describe, expect, it } from 'vitest';
import { CONSULTATION_FIELDS, consultationChoices, consultationLayoutFor, normalizeConsultationLayout, parseConsultationLibrary } from './consultationTemplates';
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
