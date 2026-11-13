import Anthropic from '@anthropic-ai/sdk';
import type { GlossaryTerm, Translator, WorkItem } from './work';

const MODEL = 'claude-sonnet-5-5';

const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'French (formal: vous)',
  de: 'German (formal: Sie)',
  it: 'Italian (formal: Lei)',
  es: 'Spanish (formal: usted)',
  pt: 'Portuguese (formal)',
};

export function systemPrompt(lng: string, glossary: GlossaryTerm[]): string {
  const terms = glossary
    .map((t) => {
      const target = (t as Record<string, string | undefined>)[lng];
      return target ? `- ${t.en} => ${target}${t.note ? ` (${t.note})` : ''}` : null;
    })
    .filter(Boolean)
    .join('\n');
  return [
    `You are translating UI strings for veterinary dental charting software used by vets and vet techs, from English into ${LANGUAGE_NAMES[lng] ?? lng}.`,
    'Rules:',
    '- Use the glossary terms below exactly.',
    '- Keep {{placeholders}}, HTML tags, and codes (Triadan numbers, AVDC abbreviations) untouched.',
    '- Match the English register: short UI labels stay short.',
    '- Use formal address (vous / Sie / Lei / usted).',
    '- When the English key ends in _one/_other, produce the i18next plural forms the target language needs; the item key is for the English form only, so translate each item independently.',
    '- If an item has a "previous" translation, it is out of date: keep its wording where the English meaning is unchanged.',
    '',
    'Glossary:',
    terms,
    '',
    'Reply with ONLY a JSON object mapping each item key to its translated string. No prose, no code fences.',
  ].join('\n');
}

/** Parse a model reply into a string map, or null if it is not one. */
export function parseReply(text: string): Record<string, string> | null {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const v: unknown = JSON.parse(stripped);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof val !== 'string') return null;
      out[k] = val;
    }
    return out;
  } catch {
    return null;
  }
}

/** Anything unparseable returns {}, so every key in the batch counts as rejected and is retried. */
export const claudeTranslator: Translator = async (lng, items: WorkItem[], glossary) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. Export it to run `npm run i18n:translate`.');
    process.exit(1);
  }
  const client = new Anthropic();
  const payload = Object.fromEntries(
    items.map((i) => [i.key, { english: i.english, ...(i.previous ? { previous: i.previous } : {}) }]),
  );
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: systemPrompt(lng, glossary),
    messages: [{ role: 'user', content: JSON.stringify(payload, null, 2) }],
  });
  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return {};
  const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return parseReply(text) ?? {};
};
