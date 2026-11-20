import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18n from '../i18n';
import { findUntranslated, installPseudoLocale, restoreLocale } from '../i18n/testing/pseudo';
import { sampleOwnerReportSnapshot } from '../utils/ownerReportSample';
import { PatientRecordHistory } from './PatientRecordHistory';
import type { ChartSnapshot } from './PdfPreviewModal';

const pdf = vi.hoisted(() => vi.fn());
const consultationPdf = vi.hoisted(() => vi.fn());
vi.mock('./PdfPreviewModal', () => ({
  PdfPreviewModal: (props: { snapshot: ChartSnapshot }) => { pdf(props.snapshot); return null; },
}));
vi.mock('../extension/sidepanel/OffscreenChartPicture', () => ({
  useOffscreenChartPicture: () => ({ element: null, hasDiagrams: true, getDiagrams: () => ({}) }),
}));
vi.mock('./ConsultationNotePdfButton', () => ({
  ConsultationNotePdfButton: (props: { text: string; language: string }) => { consultationPdf(props); return null; },
}));

afterEach(async () => { cleanup(); pdf.mockClear(); consultationPdf.mockClear(); await restoreLocale(); });

it('starts with the current visit and generates the chart PDF from the selected prior visit', async () => {
  const current = sampleOwnerReportSnapshot();
  const prior = { ...current, patientInfo: { ...current.patientInfo, date: '2025-03-01', treatmentReport: 'Prior treatment' } };
  const fetchVisit = vi.fn(async () => prior);
  render(<PatientRecordHistory current={current} currentId="current"
    listVisits={async () => [{ id: 'current', chart_date: current.patientInfo.date }, { id: 'prior', chart_date: prior.patientInfo.date }]}
    fetchVisit={fetchVisit} branding={undefined} onClose={vi.fn()} />);
  expect(screen.getByRole('tab', { name: i18n.t('media:patientRecord.pdfs') })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(await screen.findByRole('button', { name: /Mar 1, 2025.*Dental procedure/ }));
  await screen.findByRole('button', { name: /Mar 1, 2025.*Dental procedure/, pressed: true });
  expect(fetchVisit).toHaveBeenCalledExactlyOnceWith('prior');
  await vi.waitFor(() => expect(pdf).toHaveBeenLastCalledWith(expect.objectContaining({ imagesChartId: 'prior' })));
  expect(pdf).toHaveBeenLastCalledWith(expect.objectContaining({
    imagesChartId: 'prior',
    patientInfo: expect.objectContaining({ date: '2025-03-01', treatmentReport: 'Prior treatment' }),
  }));
});

it('uses the selected consultation note for PDF and keeps a same-day dental visit available', async () => {
  const current = sampleOwnerReportSnapshot();
  const consultation = { ...current, patientInfo: { ...current.patientInfo, visitType: 'consultation' as const },
    recordNote: { text: 'Saved consultation note', source: 'edited' as const, lng: 'fr' as const, basedOn: 'saved' } };
  const fetchVisit = vi.fn(async () => consultation);
  render(<PatientRecordHistory current={current} currentId="dental" listVisits={async () => [{
    id: 'consult', chart_date: current.patientInfo.date, visitType: 'consultation',
  }]} fetchVisit={fetchVisit} branding={undefined} onClose={vi.fn()} />);
  expect(screen.getByRole('button', { name: /Current visit.*Dental procedure/ })).toBeInTheDocument();
  await vi.waitFor(() => expect(pdf).toHaveBeenCalled());
  pdf.mockClear();
  fireEvent.click(await screen.findByRole('button', { name: /Consultation/ }));
  await vi.waitFor(() => expect(consultationPdf).toHaveBeenLastCalledWith(expect.objectContaining({
    text: 'Saved consultation note', language: 'fr',
  })));
  expect(pdf).not.toHaveBeenCalledWith(expect.objectContaining({ imagesChartId: 'consult' }));
  expect(fetchVisit).toHaveBeenCalledWith('consult');
});

it('translates the visit browser and its no-history state', async () => {
  await installPseudoLocale();
  const current = sampleOwnerReportSnapshot();
  render(<PatientRecordHistory current={current} currentId={null}
    fetchVisit={vi.fn()} branding={undefined} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('tab', { name: i18n.t('media:patientRecord.notes') }));
  const note = screen.getByRole('tabpanel').textContent ?? '';
  expect(findUntranslated(document.body, [current.patientInfo.patientName, note])).toEqual([]);
});
