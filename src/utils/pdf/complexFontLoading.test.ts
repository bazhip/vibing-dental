import { complexFontSources } from './complexFonts';
import { buildOwnerReportModel } from '../ownerReport';
import { defaultTemplate } from '../ownerReportConfig';
import { sampleOwnerReportSnapshot } from '../ownerReportSample';
import { buildOwnerReportPdfBytes } from '../ownerReportPdf';
import { buildDentalChartPDFBytes } from '../pdfGenerator';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), ch => ch.charCodeAt(0));
const diagram = { png: PNG, state: { marks: {}, comments: [], strokes: [] } };
const branding = { practiceName: 'عيادة أسنان', doctorName: 'Ștefan Łukasz', logoUrl: '' };

afterEach(() => vi.restoreAllMocks());

it.each(['owner', 'clinical'] as const)('%s Arabic exports load CJK fonts only when rendered content needs them', async kind => {
  const regular = vi.spyOn(complexFontSources, 'cjkRegular');
  const bold = vi.spyOn(complexFontSources, 'cjkBold');
  const snapshot = sampleOwnerReportSnapshot('ar');
  const model = buildOwnerReportModel(snapshot, { template: defaultTemplate('ar') });
  const build = (withChinese: boolean) => kind === 'owner'
    ? buildOwnerReportPdfBytes(model, { ...branding, practiceName: withChinese ? '张伟' : branding.practiceName }, [])
    : buildDentalChartPDFBytes(snapshot.patientInfo, snapshot.toothData, snapshot.species, snapshot.logo, diagram, diagram,
      'clinic', branding, { lng: 'ar', images: withChinese ? [{ jpegBytes: null, caption: '张伟 108 T/FX', kind: 'photo' }] : [] });

  const plain = await build(false);
  expect(plain.byteLength).toBeGreaterThan(1000);
  expect(regular).not.toHaveBeenCalled();
  expect(bold).not.toHaveBeenCalled();

  const mixed = await build(true);
  expect(regular).toHaveBeenCalledOnce();
  expect(bold).toHaveBeenCalledOnce();
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: mixed }).promise;
  try {
    let extracted = '';
    for (let number = 1; number <= pdf.numPages; number++) {
      const text = await (await pdf.getPage(number)).getTextContent();
      extracted += text.items.map(item => 'str' in item ? item.str : '').join('');
    }
    expect(extracted).toContain('张伟');
    if (kind === 'owner') {
      expect(extracted).toContain('Ștefan');
      expect(extracted).toContain('Łukasz');
    }
  } finally { await pdf.destroy(); }
});
