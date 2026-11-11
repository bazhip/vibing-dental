import { actionAllowedInSection, isScopedSection } from './aiAutofill';
import { actionFocus } from '../components/VoiceInputButton';

const field = { name: 'set_tooth_field', input: { triadan: 104, field: 'pocket', value: '4' } };
const preComment = { name: 'add_comment', input: { diagram: 'pre', triadan: 104, text: 'Fractured' } };
const preMissing = { name: 'set_tooth_mark', input: { diagram: 'pre', triadan: 104, mark: 'missing' } };
const postExtracted = { name: 'set_tooth_mark', input: { diagram: 'post', triadan: 209, mark: 'extracted' } };
const exam = { name: 'set_exam_finding', input: { area: 'tongue', status: 'normal' } };

describe('section scoping', () => {
  it('charting accepts grid fields and missing marks only', () => {
    expect(actionAllowedInSection(field, 'charting')).toBe(true);
    expect(actionAllowedInSection(preMissing, 'charting')).toBe(true);
    expect(actionAllowedInSection(preComment, 'charting')).toBe(false);
    expect(actionAllowedInSection(postExtracted, 'charting')).toBe(false);
    expect(actionAllowedInSection(exam, 'charting')).toBe(false);
  });

  it('diagnosis and procedure split by diagram', () => {
    expect(actionAllowedInSection(preComment, 'diagnosis')).toBe(true);
    expect(actionAllowedInSection(postExtracted, 'diagnosis')).toBe(false);
    expect(actionAllowedInSection(postExtracted, 'procedure')).toBe(true);
    expect(actionAllowedInSection(field, 'procedure')).toBe(false);
  });

  it('unscoped sections allow everything', () => {
    expect(isScopedSection('imaging')).toBe(false);
    expect(actionAllowedInSection(preComment, 'imaging')).toBe(true);
  });

  it('focus stays on the active section for in-scope actions', () => {
    expect(actionFocus(preMissing, 'charting')?.section).toBe('charting');
    expect(actionFocus(preMissing)?.section).toBe('diagnosis');
    expect(actionFocus(preComment, 'imaging')?.section).toBe('diagnosis');
  });
});
