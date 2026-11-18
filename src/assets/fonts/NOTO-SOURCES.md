# Noto PDF fonts

Bundled static TrueType instances derived from variable fonts from the official Google Fonts repository (downloaded 2026-11-18). Each is distributed under the SIL Open Font License 1.1; see its adjacent LICENSE file.

- Noto Sans SC: https://github.com/google/fonts/tree/main/ofl/notosanssc (`NotoSansSC[wght].ttf`)
- Noto Sans Arabic: https://github.com/google/fonts/tree/main/ofl/notosansarabic (`NotoSansArabic[wdth,wght].ttf`)

Generated using FontTools 4.68.0 `instantiateVariableFont` at weights 400/700 (Arabic width 100), with all variation axes pinned. No glyphs were removed. Glyph data is padded to four bytes (`font['glyf'].padding = 4`) before saving: fontkit's short-loca subset encoder truncates odd offsets, producing corrupted/missing glyphs otherwise. Static instances avoid malformed outlines when pdf-lib/fontkit subsets variable fonts.

The fonts load only when a Chinese/Arabic PDF is requested, including offline extension exports. Builders scan the complete report/chart input first: Arabic exports load Noto SC only when a Chinese name, note or caption contains Han characters; Chinese exports load Noto Arabic only when Arabic is present. Liberation remains available for Latin names. Direct font-helper callers that omit content retain complete fallback coverage. PDF fontkit instances embed only the glyphs used in the document. The same script-appropriate Noto family is used across PDF style families: standard Helvetica/Times/Courier lack these scripts. Both Noto families and the existing Liberation Sans fonts participate in per-word/per-grapheme fallback, so mixed names such as 张伟 محمد Ștefan Łukasz retain real glyphs regardless of the report locale. Fallback selection happens before shaping within each resolved bidi run; each run is rendered with its own embedded font.

Arabic shaping retains contextual forms, cursive positioning and diacritics. It disables Noto's optional `ccmp` decomposition so complete encoded dotted letters retain reliable ToUnicode mappings. Unicode bidi runs preserve Latin clinical codes and dates as LTR tokens. Positioned embedded glyphs remain vector text; spans also carry logical ActualText for supporting readers.
