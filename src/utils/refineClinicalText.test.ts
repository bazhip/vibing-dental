import { vi } from 'vitest';
import { buildClinicalRefinementRequest, preservesRefinementTokens, refineClinicalText } from './refineClinicalText';

const send = vi.hoisted(() => vi.fn());
vi.mock('./aiAutofill', () => ({ sendAutofill: send }));

it('sends only the selected text and retains the clinical rules in every mode', () => {
  const source = 'No fracture seen at 108. Possible lesion at 409.';
  for (const mode of ['clean', 'concise', 'organize'] as const) {
    const request = buildClinicalRefinementRequest(source, mode);
    expect(request.kind).toBe('refine_text');
    expect(request.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: JSON.stringify({ source }) }] }]);
    expect(request.system[0].text).toMatch(/negation, uncertainty/);
    expect(request.system[0].text).toMatch(/medications, doses, routes/);
    expect(request.system[0].text).not.toContain(source);
  }
});

it('verifies the number and placeholder inventory, including non-Latin digits', () => {
  const source = 'Tooth 108, 2.5 mg, {Follow-up}, ٣ mm.';
  expect(preservesRefinementTokens(source, 'At 108, ٣ mm and 2.5 mg. {Follow-up}')).toBe(true);
  expect(preservesRefinementTokens(source, 'Tooth 108, 2.5 mg, {Recheck}, ٣ mm.')).toBe(false);
  expect(preservesRefinementTokens(source, 'Tooth 109, 2.5 mg, {Follow-up}, ٣ mm.')).toBe(false);
  expect(preservesRefinementTokens('2.5 mg', '2.5 mcg')).toBe(false);
  expect(preservesRefinementTokens('108 and 108', '108')).toBe(false);
});

it('rejects changed values and only returns a bounded, nonempty tool result', async () => {
  const tool = (text: string) => [{ type: 'tool_use', name: 'refine_clinical_text', input: { text } }];
  send.mockResolvedValueOnce(tool('Possible fracture at 109.'));
  await expect(refineClinicalText('Possible fracture at 108.', 'clean')).rejects.toThrow(/changed a number/);
  send.mockResolvedValueOnce(tool('Possible fracture at 108.'));
  await expect(refineClinicalText('108 possible fracture', 'clean')).resolves.toBe('Possible fracture at 108.');
  send.mockResolvedValueOnce(tool('Possible fracture at 108.'));
  await expect(refineClinicalText('108 possible fracture', 'clean', 5)).rejects.toThrow(/refine the text/);
});
