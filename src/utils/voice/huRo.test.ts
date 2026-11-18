import { describe, expect, it } from 'vitest';
import { replaceSpokenNumbers } from './numbers';
import { normalizeTranscript, chunkWorthSending, isPerioOnlyText } from '../aiAutofill';
import { endsMidFindingOther } from './normalize';
import { browserSpeechLang, VOICE_STT } from './sttConfig';
import { dictationLanguageBlock, NATIVE_FEW_SHOT } from './fewShot';

const teeth = [101,102,103,104,105,106,107,108,109,110,201,202,203,204,205,206,207,208,209,210,301,302,303,304,305,306,307,308,309,310,311,401,402,403,404,405,406,407,408,409,410,411,501,502,503,504,506,507,508,601,602,603,604,606,607,608,701,702,703,704,706,707,708,801,802,803,804,806,807,808];
const huDigits = ['nulla','egy','kettő','három','négy','öt','hat','hét','nyolc','kilenc','tíz','tizenegy'];
const roDigits = ['zero','unu','doi','trei','patru','cinci','șase','șapte','opt','nouă','zece','unsprezece'];
const huHundreds = ['','száz','kétszáz','háromszáz','négyszáz','ötszáz','hatszáz','hétszáz','nyolcszáz'];
const roHundreds = ['','o sută','două sute','trei sute','patru sute','cinci sute','șase sute','șapte sute','opt sute'];

describe.each(['hu','ro'] as const)('%s dictation', (lng) => {
  it('reads all permanent and deciduous Triadan numbers and digit runs', () => {
    const digits = lng === 'hu' ? huDigits : roDigits;
    for (const n of teeth) {
      const spoken = lng === 'hu' ? huHundreds[Math.floor(n / 100)] + huDigits[n % 100] : roHundreds[Math.floor(n / 100)] + ' ' + roDigits[n % 100];
      expect(replaceSpokenNumbers(spoken, lng), spoken).toBe(String(n));
      expect(replaceSpokenNumbers(String(n).split('').map(d => digits[Number(d)]).join(' '), lng)).toBe(String(n));
    }
  });
  it('uses a documented monolingual recognition model and browser locale', () => {
    expect(VOICE_STT[lng]).toEqual({ model: 'nova-3', language: lng });
    expect(browserSpeechLang(lng, 'en-US')).toBe(lng === 'hu' ? 'hu-HU' : 'ro-RO');
  });
  it('preserves native free text, decimal instructions and extraction examples', () => {
    expect(dictationLanguageBlock(lng)).toContain(lng === 'hu' ? 'Hungarian' : 'Romanian');
    expect(NATIVE_FEW_SHOT[lng]).toContain('NO TOOL CALL');
    expect(NATIVE_FEW_SHOT[lng]).toContain('concentration=0.5');
    expect(NATIVE_FEW_SHOT[lng]).toContain('append_radiographic_findings');
  });
});

it.each([
  ['hu','száznégy mobilitás kettő, tasak öt milliméter','104 mobilitás 2, tasak 5 milliméter'],
  ['hu','mobilitás három egy nulla négy','mobilitás 3 104'],
  ['hu','kétszáztizenegy törés','kétszáztizenegy törés'],
  ['hu','tasak tizenkét milliméter','tasak 12 milliméter'],
  ['hu','tasak huszonegy milliméter','tasak 21 milliméter'],
  ['hu','százhuszonegy törés','százhuszonegy törés'],
  ['ro','o sută patru mobilitate doi, pungă de cinci milimetri','104 mobilitate 2, pungă de 5 milimetri'],
  ['ro','mobilitate trei unu zero patru','mobilitate 3 104'],
  ['ro','două sute unsprezece fractură','două sute unsprezece fractură'],
  ['ro','pungă de doisprezece milimetri','pungă de 12 milimetri'],
  ['ro','pungă douăzeci și unu milimetri','pungă 21 milimetri'],
  ['ro','pungă douăzeci și două milimetri','pungă 22 milimetri'],
  ['ro','pungă douăzeci   și unu milimetri','pungă 21 milimetri'],
  ['hu','tasak harminckét milliméter','tasak 32 milliméter'],
  ['hu','száz tíz hiányzik','110 hiányzik'],
  ['ro','o sută douăzeci și unu fractură','o sută douăzeci și unu fractură'],
] as const)('%s cleans %s', (lng, text, expected) => {
  expect(replaceSpokenNumbers(text.normalize('NFD'), lng)).toBe(expected);
});

it.each([
  ['hu','száznégy gé i kettő, ef három, T per FX','104 GI 2, F3, T/FX','mobilitás kettő','igen, köszönöm','mobilitás','és'],
  ['ro','o sută patru ge i doi, ef trei, T bară FX','104 GI 2, F3, T/FX','mobilitate doi','da, mulțumesc','mobilitate','și'],
] as const)('%s handles native codes, filters and unfinished findings', (lng, text, clean, perio, filler, pending, and) => {
  expect(normalizeTranscript(text, lng)).toBe(clean);
  expect(isPerioOnlyText(normalizeTranscript(perio,lng),lng)).toBe(true);
  expect(chunkWorthSending(filler,lng)).toBe(false);
  expect(chunkWorthSending(lng === 'hu' ? 'fogtörés' : 'fractură dentară',lng)).toBe(true);
  expect(endsMidFindingOther(pending,lng)).toBe(true);
  expect(endsMidFindingOther(and,lng)).toBe(true);
});
