/** Native numeral systems that do not follow the Latin-language word grammar.
 * Convert only valid tooth numbers or numbers in a clinical measurement context;
 * keep unrelated prose, negation and ordinal phrases as dictated. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const edgeBefore = '(?<![\\p{L}\\p{N}])';
const edgeAfter = '(?![\\p{L}\\p{N}])';

export function asciiScriptDigits(text: string): string {
  return text.replace(/[０-９٠-٩۰-۹]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0xff10 ? code - 0xff10 : code >= 0x6f0 ? code - 0x6f0 : code - 0x660);
  }).replace(/٫/g, '.');
}

const ZH_DIGITS: Record<string, string> = { 零: '0', 〇: '0', 一: '1', 幺: '1', 二: '2', 两: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9' };
function chineseValue(text: string): number {
  if (text.startsWith('负')) return -chineseValue(text.slice(1));
  if (text.includes('点')) {
    const [whole, fraction] = text.split('点');
    return Number(`${chineseValue(whole)}.${[...fraction].map(ch => ZH_DIGITS[ch]).join('')}`);
  }
  if (!/[十百千]/.test(text)) return Number([...text].map((ch) => ZH_DIGITS[ch]).join(''));
  let total = 0, digit = 0;
  for (const ch of text) {
    if (ch in ZH_DIGITS) digit = Number(ZH_DIGITS[ch]);
    else { total += (digit || 1) * ({ 十: 10, 百: 100, 千: 1000 }[ch] ?? 0); digit = 0; }
  }
  return total + digit;
}

const arKey = (s: string) => s.replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/\s+/g, ' ').trim();
const AR_SMALL = new Map<string, number>();
const arSmall = (n: number, ...forms: string[]) => forms.forEach((word) => AR_SMALL.set(arKey(word), n));
const ONES = [ ['صفر'], ['واحد','واحدة'], ['اثنان','اثنين','اثنتان','اثنتين'], ['ثلاثة','ثلاث'], ['أربعة','أربع'], ['خمسة','خمس'], ['ستة','ست'], ['سبعة','سبع'], ['ثمانية','ثمان','ثماني'], ['تسعة','تسع'], ['عشرة','عشر'] ];
ONES.forEach((forms, n) => arSmall(n, ...forms));
arSmall(11, 'أحد عشر', 'إحدى عشرة');
arSmall(12, 'اثنا عشر', 'اثني عشر', 'اثنتا عشرة', 'اثنتي عشرة');
for (let n = 13; n <= 19; n++) for (const one of ONES[n - 10]) for (const ten of ['عشر','عشرة']) arSmall(n, `${one} ${ten}`);
const TENS = ['', '', 'عشر', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثمان', 'تسع'];
for (let ten = 2; ten <= 9; ten++) for (const ending of ['ون', 'ين']) {
  const tens = `${TENS[ten]}${ending}`;
  arSmall(ten * 10, tens);
  for (let one = 1; one <= 9; one++) for (const word of ONES[one]) arSmall(ten * 10 + one, `${word} و${tens}`, `${word} و ${tens}`);
}
const AR_HUNDREDS = new Map<string, number>();
for (const [n,forms] of [
  [1,['مائة','مئة']], [2,['مائتان','مئتان','مائتين','مئتين']],
  [3,['ثلاثمائة','ثلاثمئة','ثلاث مائة','ثلاث مئة']],
  [4,['أربعمائة','أربعمئة','أربع مائة','أربع مئة']],
  [5,['خمسمائة','خمسمئة','خمس مائة','خمس مئة']],
  [6,['ستمائة','ستمئة','ست مائة','ست مئة']],
  [7,['سبعمائة','سبعمئة','سبع مائة','سبع مئة']],
  [8,['ثمانمائة','ثمانمئة','ثمان مائة','ثمان مئة']],
] as [number,string[]][]) for (const word of forms) AR_HUNDREDS.set(arKey(word), n);

// Optional vowel marks preserve matching without stripping them from free text.
const arPattern = (word: string) => [...word].map((ch) => ch === ' ' ? '\\s+' : `${ch === 'ا' ? '[اأإآ]' : escapeRe(ch)}[\\u064b-\\u065f\\u0670\\u0640]*`).join('');
const arAlt = (keys: Iterable<string>) => [...keys].sort((a,b) => b.length - a.length).map(arPattern).join('|');
export const arabicTermsPattern = (terms: readonly string[]) => arAlt(terms.map(arKey));
const smallPattern = arAlt(AR_SMALL.keys());
const hundredPattern = arAlt(AR_HUNDREDS.keys());
const digitPattern = arAlt([...AR_SMALL].filter(([,n]) => n < 10).map(([word]) => word));

export function replaceScriptNumbers(
  raw: string, lng: 'zh' | 'ar',
  context: { isTooth: (n: number) => boolean; scores: string; units: string },
): string {
  let text = asciiScriptDigits(raw.normalize('NFC'));
  const { isTooth, scores, units } = context;
  if (lng === 'zh') {
    const before = new RegExp(`(?:${scores})(?:的|为|是|等级|级|度)?\\s*$`, 'iu');
    const after = new RegExp(`^\\s*(?:${units}|级|度)`, 'iu');
    return text.replace(/负?[零〇一幺二两三四五六七八九十百千]+(?:点[零〇一幺二两三四五六七八九]+)?/g, (token, offset: number) => {
      if (text[offset - 1] === '第') return token;
      if (before.test(text.slice(0, offset)) && /^[零〇一幺二两三四五六七八九]{4}$/.test(token)) {
        const digits = [...token].map(ch => ZH_DIGITS[ch]).join('');
        if (Number(digits[0]) <= 4 && isTooth(Number(digits.slice(1)))) return `${digits[0]} ${digits.slice(1)}`;
      }
      const value = chineseValue(token);
      return isTooth(value) || before.test(text.slice(0,offset)) || after.test(text.slice(offset+token.length)) ? String(value) : token;
    });
  }
  const beforeScore = new RegExp(`(?:${scores})[\\s،,:.-]*(?:(?:درجة|بدرجة|بمقدار|هو|هي)\\s+)?$`, 'iu');
  const afterUnit = new RegExp(`^[\\s-]*(?:${units})${edgeAfter}`, 'iu');
  // Hundreds first: an entire compound is a tooth, never a fragment of prose.
  text = text.replace(new RegExp(`${edgeBefore}(${hundredPattern})(?:\\s*و?\\s*(${smallPattern}))?${edgeAfter}`, 'gu'), (all, h: string, r: string | undefined, offset: number) => {
    const value = AR_HUNDREDS.get(arKey(h))! * 100 + (r ? AR_SMALL.get(arKey(r))! : 0);
    return isTooth(value) || beforeScore.test(text.slice(0,offset)) || afterUnit.test(text.slice(offset+all.length)) ? String(value) : all;
  });
  // A score consumes its own number before adjacent digit-spoken teeth.
  text = text.replace(new RegExp(`${edgeBefore}(${smallPattern})${edgeAfter}`, 'gu'), (all, word: string, offset: number) => {
    return beforeScore.test(text.slice(0,offset)) || afterUnit.test(text.slice(offset+all.length)) ? String(AR_SMALL.get(arKey(word))) : all;
  });
  // Digit-by-digit dictation is common for Triadan identifiers.
  text = text.replace(new RegExp(`${edgeBefore}(${digitPattern})[\\s-]+(${digitPattern})[\\s-]+(${digitPattern})${edgeAfter}`, 'gu'), (all,a:string,b:string,c:string) => {
    const value=Number([a,b,c].map(w=>AR_SMALL.get(arKey(w))).join(''));
    return isTooth(value) ? String(value) : all;
  });
  return text;
}
