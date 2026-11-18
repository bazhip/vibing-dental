import { treatmentCardText } from './pdf/sections';
import { applyAiActions, invalidReason } from './aiAutofill';

describe('radiographic findings', () => {
  it('PDF: unchanged without reports; labelled blocks with them', () => {
    expect(treatmentCardText('Scaled and polished.')).toBe('Scaled and polished.');
    expect(treatmentCardText('Scaled and polished.', { radiographic: '  ', ct: ' ' })).toBe('Scaled and polished.');
    expect(treatmentCardText('Scaled and polished.', { radiographic: '307: type 2 TR' }))
      .toBe('RADIOGRAPHIC REPORT\n307: type 2 TR\n\nTREATMENT\nScaled and polished.');
    expect(treatmentCardText('', { radiographic: '307: type 2 TR' })).toBe('RADIOGRAPHIC REPORT\n307: type 2 TR');
  });

  it('PDF: CT report prints below the radiographic report', () => {
    expect(treatmentCardText('Scaled and polished.', { radiographic: '307: type 2 TR', ct: 'TMJs normal' }))
      .toBe('RADIOGRAPHIC REPORT\n307: type 2 TR\n\nCT REPORT\nTMJs normal\n\nTREATMENT\nScaled and polished.');
    expect(treatmentCardText('', { ct: 'TMJs normal' })).toBe('CT REPORT\nTMJs normal');
  });

  it('dictation can append findings and record a caudal maxillary block', () => {
    const appendRadiographicFindings = vi.fn();
    const setNerveBlock = vi.fn();
    const handlers = { appendRadiographicFindings, setNerveBlock } as never;
    const applied = applyAiActions([
      { name: 'append_radiographic_findings', input: { text: '108: vertical bone loss distal root' } },
      { name: 'set_nerve_block', input: { site: 'caudalMaxillaryLeft', mL: '0.3' } },
    ], handlers);
    expect(applied).toHaveLength(2);
    expect(appendRadiographicFindings).toHaveBeenCalledWith('108: vertical bone loss distal root');
    expect(setNerveBlock).toHaveBeenCalledWith('caudalMaxillaryLeft', '0.3');
    expect(invalidReason({ name: 'append_radiographic_findings', input: { text: 'x' } })).toBeNull();
  });
});
