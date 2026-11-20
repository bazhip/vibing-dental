import type { FinalSegment } from '../../hooks/useVoiceCapture';
import type { AppLanguage } from '../../i18n/config';
import type { ToothData } from '../../types';
import type { AiAction } from '../aiAutofill';

// A literal, complete periodontal score from one confident finalized
// utterance. All interpretation and corrections belong to live extraction.
const SCORE = /^(?:Speaker 0:\s*)?([1-8]\d{2}),?\s+(mobility|gingivitis|calculus)\s+([0-3])\.$/i;

export function directDentalScore(
  segment: FinalSegment,
  teeth: readonly ToothData[],
  lng: AppLanguage,
  earlier: string,
): AiAction | null {
  if (lng !== 'en' || !segment.highConfidence || segment.annotated !== segment.text || /\[\?/.test(segment.text)) return null;
  // A surrounding question, correction or another speaker can change
  // what a complete-looking sentence means. Keep mixed context with AI.
  if (earlier && (!earlier.endsWith('.') || earlier.slice(0, -1).split('.')
    .some(sentence => !SCORE.test(`${sentence.trim()}.`)))) return null;

  const match = SCORE.exec(segment.text.trim());
  if (!match) return null;
  const triadan = Number(match[1]);
  const field = match[2].toLowerCase() as 'mobility' | 'gingivitis' | 'calculus';
  const value = match[3];
  const tooth = teeth.find(candidate => candidate.triadan === triadan);
  if (!tooth || (tooth[field] && tooth[field] !== value)) return null;
  return { name: 'set_tooth_field', input: { triadan, field, value } };
}
