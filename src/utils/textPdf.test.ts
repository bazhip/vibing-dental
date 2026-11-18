import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderClinicalTextPdf } from './textPdf';
it('renders long clinical reports across pages without silently clipping the fixed chart card', async () => {
 const data=await renderClinicalTextPdf(('108: 4.5 mm lucency — suspected, not confirmed.\n').repeat(110),'Radiology report');
 expect((await PDFDocument.load(data)).getPageCount()).toBeGreaterThan(2);
});
it('supports all five report languages with Latin accents', async () => {
 for(const value of ['Findings','Résultats','Befunde','Reperti','Hallazgos clínicos']) expect((await PDFDocument.load(await renderClinicalTextPdf(value,value))).getPageCount()).toBe(1);
});
it('rejects unsupported glyphs instead of silently removing clinical text', async () => {
 await expect(renderClinicalTextPdf('犬: 4.5 mm','Report')).rejects.toEqual({code:'font'});
});
it('bounds pagination rather than returning a partial report', async () => {
 await expect(renderClinicalTextPdf('108\n'.repeat(12000),'Report')).rejects.toEqual({code:'limit'});
});
