import { replaceSpokenNumbers } from './numbers';
import { normalizeTranscript, chunkWorthSending, isPerioOnlyText } from '../aiAutofill';
import { endsMidFindingOther } from './normalize';
import { VOICE_STT, browserSpeechLang } from './sttConfig';
import { NATIVE_FEW_SHOT, dictationLanguageBlock } from './fewShot';

it.each([
 ['zh','一百零四牙龈炎二，牙周袋五毫米','104牙龈炎2，牙周袋5毫米'],
 ['zh','一零四松动度三','104松动度3'],
 ['zh','五百零四乳牙折断','504乳牙折断'],
 ['zh','牙周袋十二毫米','牙周袋12毫米'],
 ['zh','牙周袋二十一毫米','牙周袋21毫米'],
 ['zh','第一天复查，牙结石两级','第一天复查，牙结石2级'],
 ['zh','１２３号并非有效牙位','123号并非有效牙位'],
 ['ar','مائة وأربعة التهاب اللثة اثنان','104 التهاب اللثة 2'],
 ['ar','مئتان وتسعة كسر التاج','209 كسر التاج'],
 ['ar','خمسمائة وأربعة سن لبني','504 سن لبني'],
 ['ar','واحد صفر أربعة جيب خمسة مليمتر','104 جيب 5 مليمتر'],
 ['ar','١٠٤ جيب ٥ مم و ۰٫۳ مل','104 جيب 5 مم و 0.3 مل'],
 ['ar','جيب اثنا عشر مليمتر','جيب 12 مليمتر'],
 ['ar','جيب واحد وعشرون مليمتر','جيب 21 مليمتر'],
 ['ar','لا يوجد كسر في السن','لا يوجد كسر في السن'],
] as const)('%s recognizes native numbers in %s', (lng,source,expected) => {
 expect(replaceSpokenNumbers(source,lng)).toBe(expected);
});

it.each([
 ['zh','嗯，好的，谢谢','一百零四没有骨折','牙龈炎2，牙结石1','牙周袋'],
 ['ar','نعم، شكرًا','١٠٤ لا يوجد كسر','التهاب اللثة 2، قلح 1','جيب'],
] as const)('%s preserves findings and negation while filtering filler', (lng,filler,finding,perio,dangling) => {
 expect(chunkWorthSending(filler,lng)).toBe(false);
 expect(chunkWorthSending(finding,lng)).toBe(true);
 expect(normalizeTranscript(finding,lng)).toContain('104');
 expect(isPerioOnlyText(perio,lng)).toBe(true);
 expect(endsMidFindingOther(dangling,lng)).toBe(true);
 expect(VOICE_STT[lng]).toEqual({ model: 'nova-3', language: lng === 'zh' ? 'zh-CN' : 'ar' });
 expect(browserSpeechLang(lng,'en-US')).toBe(lng === 'zh' ? 'zh-CN' : 'ar-SA');
 expect(NATIVE_FEW_SHOT[lng]).toContain('NO TOOL CALL');
 expect(dictationLanguageBlock(lng)).toContain(lng === 'zh' ? 'Chinese' : 'Arabic');
});

it('retains meaningful single-character Chinese findings', () => {
 expect(chunkWorthSending('痛','zh')).toBe(true);
 expect(chunkWorthSending('嗯','zh')).toBe(false);
});

it('keeps Arabic numeral-only tooth references and attached conjunctions', () => {
 expect(chunkWorthSending('١٠٤','ar')).toBe(true);
 expect(replaceSpokenNumbers('والجيب خمسة مليمتر، وتخلخل اثنان','ar')).toBe('والجيب 5 مليمتر، وتخلخل 2');
});
