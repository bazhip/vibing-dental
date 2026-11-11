import { actionAllowedInSection, actionAllowedAnywhere, isScopedSection } from './aiAutofill';
import { actionFocus, withDestination } from '../components/VoiceInputButton';

const field = { name: 'set_tooth_field', input: { triadan: 104, field: 'pocket', value: '4' } };
const preComment = { name: 'add_comment', input: { diagram: 'pre', triadan: 104, text: 'Fractured' } };
const preMissing = { name: 'set_tooth_mark', input: { diagram: 'pre', triadan: 104, mark: 'missing' } };
const postExtracted = { name: 'set_tooth_mark', input: { diagram: 'post', triadan: 209, mark: 'extracted' } };
const exam = { name: 'set_exam_finding', input: { area: 'tongue', status: 'normal' } };

describe('section scoping', () => {
  it('charting accepts grid fields, missing marks and diagnosis notes', () => {
    expect(actionAllowedInSection(field, 'charting')).toBe(true);
    expect(actionAllowedInSection(preMissing, 'charting')).toBe(true);
    expect(actionAllowedInSection(preComment, 'charting')).toBe(true);
    const perioComment = { name: 'add_comment', input: { diagram: 'pre', triadan: 104, text: 'GI 2, calc 1' } };
    expect(actionAllowedInSection(perioComment, 'charting')).toBe(false);
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
    expect(actionFocus(preComment, 'charting')?.section).toBe('charting');
  });
});

describe('dictating from any page', () => {
  it('every finding is allowed, except perio scores written as a diagram note', () => {
    for (const a of [field, preComment, preMissing, postExtracted, exam]) expect(actionAllowedAnywhere(a)).toBe(true);
    expect(actionAllowedAnywhere({ name: 'add_comment', input: { diagram: 'pre', triadan: 104, text: 'GI 2, calc 1' } })).toBe(false);
  });

  it('focus follows a finding that belongs on another page', () => {
    expect(actionFocus(exam, 'charting')?.section).toBe('exam');
    expect(actionFocus(postExtracted, 'charting')?.section).toBe('procedure');
  });
});

describe('activity lines name where a change went', () => {
  it('no prefix when the change belongs on the open page', () => {
    expect(withDestination(field, 'charting')).not.toMatch(/^→/);
  });
  it('prefixes the destination page otherwise', () => {
    expect(withDestination(exam, 'charting')).toMatch(/^→ Exam: /);
    expect(withDestination(field, 'exam')).toMatch(/^→ Charting: /);
  });
});
