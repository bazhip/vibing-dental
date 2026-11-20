import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => vi.resetModules());

test('practice reports use native code definitions before that app language has ever been loaded', async () => {
  vi.resetModules();
  const { default: freshI18n } = await import('../i18n');
  const { ownerFriendlyText } = await import('./ownerReportCodes');
  expect(freshI18n.language).toBe('en');
  // PD3 has no curated owner phrase, so it uses the clinical code catalog.
  expect(ownerFriendlyText('PD3', 'hu')).toContain('fogágygyulladás');
  expect(ownerFriendlyText('PD3', 'ro').toLowerCase()).toContain('parodontită');
});

test('exports a Polish take-home with searchable text from an English workspace', async () => {
  const { default: i18n } = await import('../i18n');
  const { buildOwnerReportModel } = await import('./ownerReport');
  const { defaultTemplate } = await import('./ownerReportConfig');
  const { buildOwnerReportPdfBytes } = await import('./ownerReportPdf');
  const { sampleOwnerReportSnapshot } = await import('./ownerReportSample');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');

  expect(i18n.language).toBe('en');
  const snapshot = sampleOwnerReportSnapshot('pl');
  snapshot.patientInfo.patientName = 'Łatka';
  snapshot.patientInfo.ownerName = 'Żaneta Wójcik';
  const model = buildOwnerReportModel(snapshot, { template: defaultTemplate('pl') });
  const branding = { practiceName: 'Przychodnia Brzozowa', doctorName: '', logoUrl: '' };
  const pdf = await getDocument({ data: await buildOwnerReportPdfBytes(model, branding, []) }).promise;
  try {
    const pages = await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) =>
      (await (await pdf.getPage(index + 1)).getTextContent()).items
        .map((item) => 'str' in item ? item.str : '').join(' '),
    ));
    const text = pages.join(' ');
    expect(model.locale).toBe('pl');
    expect(text).toContain('Łatka');
    expect(text).toContain('Żaneta Wójcik');
    expect(text).toMatch(/domowa pielęgnacja zębów/i);
  } finally {
    await pdf.destroy();
  }
});
