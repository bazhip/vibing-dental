import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, beforeEach, test, expect } from 'vitest';

const env = vi.hoisted(() => ({ native: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => env.native }));
const saveChartPdf = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock('../native/saveFile', () => ({ saveChartPdf: (...a: unknown[]) => saveChartPdf(...a), saveFile: vi.fn() }));
const savePdf = vi.fn(async (..._a: unknown[]) => 'downloaded');
vi.mock('../utils/savePdf', () => ({ savePdf: (...a: unknown[]) => savePdf(...a), downloadHint: () => 'HINT' }));
vi.mock('../utils/svgToPng', () => ({ diagramSvgToPng: vi.fn(async () => new Uint8Array([1])) }));
vi.mock('../utils/pdfGenerator', async (orig) => ({
  ...(await orig<typeof import('../utils/pdfGenerator')>()),
  buildDentalChartPDFBytes: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));
vi.mock('./PdfPagesPreview', () => ({ canShowPdfInline: () => true, PdfPagesPreview: () => null }));

import { PdfPreviewModal, type ChartSnapshot } from './PdfPreviewModal';

const svg = () => document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
const empty = { marks: {}, comments: [], strokes: [] };
const snapshot = {
  patientInfo: { patientName: 'Fluffy', patientNumber: '7', date: '2026-11-13' },
  toothData: [], species: 'canine', logo: null,
  preSvg: svg(), preComments: [], preState: empty,
  postSvg: svg(), postComments: [], postState: empty,
} as unknown as ChartSnapshot;

beforeEach(() => {
  saveChartPdf.mockClear();
  savePdf.mockClear();
  URL.createObjectURL = vi.fn(() => 'blob:pdf') as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
});

async function clickDownload(name = 'Download PDF') {
  render(<PdfPreviewModal open onClose={() => {}} snapshot={snapshot} />);
  const button = screen.getByRole('button', { name });
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
}

test('web: Download PDF uses the browser save flow (savePdf), with its hint', async () => {
  env.native = false;
  await clickDownload();
  expect(savePdf).toHaveBeenCalledTimes(1);
  expect(saveChartPdf).not.toHaveBeenCalled();
  expect(screen.getByRole('note')).toHaveTextContent('HINT');
});

test('iOS app: Share PDF goes to the native share sheet, no browser hint', async () => {
  env.native = true;
  await clickDownload('Share PDF');
  expect(saveChartPdf).toHaveBeenCalledTimes(1);
  expect(saveChartPdf.mock.calls[0][1]).toBe('fluffy_7_dental_chart_2026-11-13.pdf');
  expect(savePdf).not.toHaveBeenCalled();
  expect(screen.queryByRole('note')).toBeNull();
});
