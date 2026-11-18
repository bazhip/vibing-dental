import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { vi, beforeEach, test, expect } from 'vitest';

const env = vi.hoisted(() => ({ native: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => env.native }));
const saveChartPdf = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock('../native/saveFile', () => ({ saveChartPdf: (...a: unknown[]) => saveChartPdf(...a), saveFile: vi.fn() }));
const savePdf = vi.fn(async (..._a: unknown[]) => 'downloaded');
vi.mock('../utils/savePdf', () => ({ savePdf: (...a: unknown[]) => savePdf(...a), downloadHint: () => 'HINT', inAppBrowserMessage: () => 'unsupported' }));
vi.mock('../utils/svgToPng', () => ({ diagramSvgToPng: vi.fn(async () => new Uint8Array([1])) }));
vi.mock('../utils/pdfGenerator', async (orig) => ({
  ...(await orig<typeof import('../utils/pdfGenerator')>()),
  buildDentalChartPDFBytes: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));
vi.mock('./PdfPagesPreview', () => ({ canShowPdfInline: () => true, PdfPagesPreview: () => null }));

const listAttachments = vi.fn();
const fetchImage = vi.fn();
vi.mock('../hooks/useAttachments', () => ({ listChartAttachments: (...args: unknown[]) => listAttachments(...args) }));
vi.mock('../utils/imageJpeg', () => ({ fetchAsJpeg: (...args: unknown[]) => fetchImage(...args) }));

import { createPdfDownloadLink } from '../utils/pdfDownloadLink';
vi.mock('../utils/pdfDownloadLink', () => ({ createPdfDownloadLink: vi.fn(), LINK_TTL_MINUTES: 10 }));
import { buildDentalChartPDFBytes } from '../utils/pdfGenerator';
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
  vi.mocked(createPdfDownloadLink).mockReset().mockResolvedValue('https://example.test/download');
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

 test('failed images require explicit incomplete export and retry restores normal export', async () => {
  env.native = false;
  listAttachments.mockResolvedValueOnce(null).mockResolvedValueOnce([]);
  render(<PdfPreviewModal open onClose={() => {}} snapshot={{ ...snapshot, imagesChartId: 'a' }} />);
  const retry = await screen.findByRole('button', { name: 'Retry images' });
  expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
  const incomplete = screen.getByRole('button', { name: 'Download without images' });
  await waitFor(() => expect(incomplete).toBeEnabled());
  fireEvent.click(incomplete);
  expect(savePdf).toHaveBeenCalledTimes(1);
  fireEvent.click(retry);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled());
  expect(screen.queryByRole('button', { name: 'Download without images' })).toBeNull();
});

test('a new snapshot cannot download the previous preview while images load', async () => {
  env.native = false;
  listAttachments.mockResolvedValueOnce([]).mockImplementationOnce(() => new Promise(() => {}));
  const { rerender } = render(<PdfPreviewModal open onClose={() => {}} snapshot={{ ...snapshot, imagesChartId: 'a' }} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled());
  rerender(<PdfPreviewModal open onClose={() => {}} snapshot={{ ...snapshot, imagesChartId: 'b' }} />);
  expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  expect(savePdf).not.toHaveBeenCalled();
});

 test('partial image failure exports no image pages only with explicit consent', async () => {
  env.native = false;
  listAttachments.mockResolvedValueOnce([{ id: 'image', url: 'https://example.test/image.jpg' }]);
  fetchImage.mockResolvedValueOnce(null);
  render(<PdfPreviewModal open onClose={() => {}} snapshot={{ ...snapshot, imagesChartId: 'partial' }} />);
  const incomplete = await screen.findByRole('button', { name: 'Download without images' });
  await waitFor(() => expect(incomplete).toBeEnabled());
  expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
  expect(vi.mocked(buildDentalChartPDFBytes).mock.lastCall?.[8]).toMatchObject({ images: [] });
  fireEvent.click(incomplete);
  expect(savePdf).toHaveBeenCalledTimes(1);
});

test('late image failure from an old chart does not replace a ready new chart', async () => {
  env.native = false;
  let finishOld!: (value: null) => void;
  listAttachments.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockResolvedValueOnce([]);
  const { rerender } = render(<PdfPreviewModal open onClose={() => {}} snapshot={{ ...snapshot, imagesChartId: 'old' }} />);
  rerender(<PdfPreviewModal open onClose={() => {}} snapshot={{ ...snapshot, imagesChartId: 'new' }} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled());
  await act(async () => { finishOld(null); });
  expect(screen.queryByRole('button', { name: 'Retry images' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
});

test('failed rebuild cannot export bytes from the previous successful preview', async () => {
  env.native = false;
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { rerender } = render(<PdfPreviewModal open onClose={() => {}} snapshot={snapshot} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled());
  vi.mocked(buildDentalChartPDFBytes).mockRejectedValueOnce(new Error('build failed'));
  rerender(<PdfPreviewModal open onClose={() => {}} snapshot={{ ...snapshot }} />);
  await screen.findByText(/Couldn't build the preview/);
  expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  expect(savePdf).not.toHaveBeenCalled();
  log.mockRestore();
});

 test('retry invalidates a delayed unsupported save before it can upload an old PDF', async () => {
  env.native = false;
  let finishSave!: (outcome: string) => void;
  savePdf.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }));
  listAttachments.mockResolvedValueOnce(null).mockResolvedValueOnce([]);
  render(<PdfPreviewModal open onClose={() => {}} snapshot={{ ...snapshot, imagesChartId: 'a' }} />);
  const incomplete = await screen.findByRole('button', { name: 'Download without images' });
  await waitFor(() => expect(incomplete).toBeEnabled());
  fireEvent.click(incomplete);
  fireEvent.click(screen.getByRole('button', { name: 'Retry images' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled());
  await act(async () => { finishSave('unsupported'); });
  expect(createPdfDownloadLink).not.toHaveBeenCalled();
});

test('retry prevents an already uploading incomplete PDF link from reappearing', async () => {
  env.native = false;
  let finishLink!: (url: string) => void;
  savePdf.mockResolvedValueOnce('unsupported');
  vi.mocked(createPdfDownloadLink).mockImplementationOnce(() => new Promise(resolve => { finishLink = resolve; }));
  listAttachments.mockResolvedValueOnce(null).mockResolvedValueOnce([]);
  render(<PdfPreviewModal open onClose={() => {}} snapshot={{ ...snapshot, imagesChartId: 'a' }} />);
  const incomplete = await screen.findByRole('button', { name: 'Download without images' });
  await waitFor(() => expect(incomplete).toBeEnabled());
  fireEvent.click(incomplete);
  await screen.findByText('Preparing a download link…');
  fireEvent.click(screen.getByRole('button', { name: 'Retry images' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled());
  await act(async () => { finishLink('https://example.test/stale'); });
  expect(screen.queryByRole('link')).toBeNull();
});

const lifecycle = (overrides = {}) => ({ unsaved: false, unfinalized: true, canFinalize: true, finalize: vi.fn(async () => true), ...overrides });
async function warningPreview(state = lifecycle()) {
  env.native = false;
  const view = render(<PdfPreviewModal open snapshot={snapshot} onClose={() => {}} lifecycle={state} />);
  const button = screen.getByRole('button', { name: 'Download PDF' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  return view;
}

test('unfinalized PDF warns and download anyway exports without finalizing', async () => {
  const state = lifecycle();
  await warningPreview(state);
  expect(savePdf).not.toHaveBeenCalled();
  expect(screen.getByText('This chart has not been finalized.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Download anyway' }));
  expect(savePdf).toHaveBeenCalledTimes(1);
  expect(state.finalize).not.toHaveBeenCalled();
});

test('finalize and download waits for success and blocks duplicate clicks', async () => {
  let finish!: (ok: boolean) => void;
  const state = lifecycle({ unsaved: true, finalize: vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; })) });
  await warningPreview(state);
  expect(screen.getByText('This chart has unsaved changes and has not been finalized.')).toBeVisible();
  const button = screen.getByRole('button', { name: 'Finalize and download' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(state.finalize).toHaveBeenCalledTimes(1);
  expect(savePdf).not.toHaveBeenCalled();
  await act(async () => finish(true));
  expect(savePdf).toHaveBeenCalledTimes(1);
});

test.each([false, 'reject'])('failed or cancelled finalization (%s) keeps bypass available', async (outcome) => {
  await warningPreview(lifecycle({ finalize: async () => { if (outcome === 'reject') throw new Error('offline'); return false; } }));
  fireEvent.click(screen.getByRole('button', { name: 'Finalize and download' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not finalize this chart. You can try again or download anyway.');
  expect(savePdf).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Download anyway' }));
  expect(savePdf).toHaveBeenCalledTimes(1);
});

test('Cancel and Escape dismiss only the export warning', async () => {
  await warningPreview();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(savePdf).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByText('Before downloading')).toBeNull();
  expect(savePdf).not.toHaveBeenCalled();
});

test('finalized and saved chart downloads immediately', async () => {
  await warningPreview(lifecycle({ unfinalized: false }));
  expect(savePdf).toHaveBeenCalledTimes(1);
});

test('unsaved local chart warns without offering cloud finalization', async () => {
  await warningPreview(lifecycle({ unsaved: true, canFinalize: false }));
  expect(screen.queryByRole('button', { name: 'Finalize and download' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Download anyway' }));
  expect(savePdf).toHaveBeenCalledTimes(1);
});

test('closing preview during finalization prevents a late download', async () => {
  let finish!: (ok: boolean) => void;
  const state = lifecycle({ finalize: () => new Promise<boolean>(resolve => { finish = resolve; }) });
  const view = await warningPreview(state);
  fireEvent.click(screen.getByRole('button', { name: 'Finalize and download' }));
  view.rerender(<PdfPreviewModal open={false} snapshot={snapshot} onClose={() => {}} lifecycle={state} />);
  await act(async () => finish(true));
  expect(savePdf).not.toHaveBeenCalled();
});

test('native sharing also requires explicit acknowledgement', async () => {
  env.native = true;
  render(<PdfPreviewModal open snapshot={snapshot} onClose={() => {}} lifecycle={lifecycle()} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Share PDF' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Share PDF' }));
  expect(saveChartPdf).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Download anyway' }));
  expect(saveChartPdf).toHaveBeenCalledTimes(1);
});

test('download without images also warns before bypassing', async () => {
  env.native = false;
  listAttachments.mockResolvedValueOnce(null);
  render(<PdfPreviewModal open snapshot={{ ...snapshot, imagesChartId: 'warning' }} onClose={() => {}} lifecycle={lifecycle()} />);
  const button = await screen.findByRole('button', { name: 'Download without images' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(savePdf).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Download anyway' }));
  expect(savePdf).toHaveBeenCalledTimes(1);
});

test('switching preview snapshots while finalizing prevents the old export', async () => {
  let finish!: (ok: boolean) => void;
  const state = lifecycle({ finalize: () => new Promise<boolean>(resolve => { finish = resolve; }) });
  const view = await warningPreview(state);
  fireEvent.click(screen.getByRole('button', { name: 'Finalize and download' }));
  view.rerender(<PdfPreviewModal open snapshot={{ ...snapshot }} onClose={() => {}} lifecycle={state} />);
  await act(async () => finish(true));
  expect(savePdf).not.toHaveBeenCalled();
});


test('keeps the focused primary action visible when lifecycle becomes busy', async () => {
  let finish!: (ok: boolean) => void;
  const state = lifecycle({ finalize: () => new Promise<boolean>(resolve => { finish = resolve; }) });
  const view = await warningPreview(state);
  const primary = screen.getByRole('button', { name: 'Finalize and download' });
  primary.focus();
  fireEvent.click(primary);
  view.rerender(<PdfPreviewModal open snapshot={snapshot} onClose={() => {}} lifecycle={{ ...state, canFinalize: false }} />);
  expect(screen.getByRole('button', { name: 'Finalizing…' })).toBeDisabled();
  const dialog = screen.getByRole('dialog', { name: 'Before downloading' });
  expect(dialog).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Tab' });
  expect(dialog).toHaveFocus();
  await act(async () => finish(true));
});

test('warning keyboard events do not reach the underlying native sheet', async () => {
  env.native = false;
  const sheetKeyDown = vi.fn();
  render(<div onKeyDown={sheetKeyDown}><PdfPreviewModal open snapshot={snapshot} onClose={() => {}} lifecycle={lifecycle()} /></div>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Finalize and download' }), { key: 'Tab' });
  expect(sheetKeyDown).not.toHaveBeenCalled();
});
