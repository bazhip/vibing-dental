import { describe, expect, it } from 'vitest';
import { VISIT_DOCUMENT_TEMPLATES, VISIT_DOCUMENT_FIELDS, normalizeVisitDocumentation } from './visitDocumentation';

describe('visit source templates', () => {
  it('defines stable templates with independent source fields and no tooth dependencies', () => {
    expect(VISIT_DOCUMENT_TEMPLATES.consultation.id).toBe('consultation-v1');
    expect(VISIT_DOCUMENT_TEMPLATES.discharge.id).toBe('discharge-v1');
    expect(VISIT_DOCUMENT_TEMPLATES.consultation.fields.map(f => f.id)).toEqual(['complaint', 'consultationHistory', 'consultationAssessment', 'consultationPlan']);
    expect(VISIT_DOCUMENT_FIELDS).toHaveLength(6);
  });
  it('keeps entered wording verbatim and drops malformed or oversized imported values', () => {
    expect(normalizeVisitDocumentation({ consultationHistory: '  uncertain\n  2 mg?  ', consultationPlan: [], dischargeInstructions: 'x'.repeat(20001) } as never))
      .toEqual({ consultationHistory: '  uncertain\n  2 mg?  ' });
    expect(normalizeVisitDocumentation({} as never)).toEqual({});
  });
});
