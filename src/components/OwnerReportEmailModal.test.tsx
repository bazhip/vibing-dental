import React from 'react';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';
import i18n from '../i18n';
import { ApiError } from '../utils/apiErrors';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ ok: true, to: 'sam@example.com', sentAt: '2026-11-14T10:00:00Z' })),
  language: 'en' as string,
  toast: vi.fn(),
}));
vi.mock('../utils/edgeFunctions', () => ({ invokeFunction: mocks.invoke }));
vi.mock('../hooks/usePracticeLanguage', () => ({
  usePracticeLanguage: () => ({ language: mocks.language, explicit: true, loaded: true, save: vi.fn() }),
}));
vi.mock('./ui/dialogs', async (orig) => ({ ...(await orig<typeof import('./ui/dialogs')>()), toast: mocks.toast }));

import { OwnerReportEmailModal } from './OwnerReportEmailModal';

const pdfText = '%PDF-1.7 test';
const pdfBlob = new Blob([pdfText], { type: 'application/pdf' });
const getPdf = () => ({ blob: pdfBlob, filename: 'rex_owner_report.pdf' });

function setup(onClose = vi.fn()) {
  render(
    <OwnerReportEmailModal
      open
      onClose={onClose}
      chartId="c1"
      practiceId="p1"
      practiceName="Elm Vet"
      toEmail="sam@example.com"
      patientName="Rex"
      ownerName="Sam"
      getPdf={getPdf}
    />,
  );
  return { onClose };
}

describe('OwnerReportEmailModal', () => {
  beforeEach(() => { mocks.invoke.mockClear(); mocks.toast.mockClear(); mocks.language = 'en'; });

  it('prefills the subject in the practice client language', () => {
    mocks.language = 'fr';
    setup();
    const expected = i18n.getFixedT('fr', 'client')('ownerReportEmail.subject', { pet: 'Rex' });
    expect(screen.getByLabelText(/subject/i)).toHaveValue(expected);
    expect(expected).not.toBe(i18n.getFixedT('en', 'client')('ownerReportEmail.subject', { pet: 'Rex' }));
  });

  it('shows the saved owner email read-only and the attachment name', () => {
    setup();
    expect(screen.getByDisplayValue('sam@example.com')).toHaveAttribute('readonly');
    expect(screen.getByText(/rex_owner_report\.pdf/)).toBeInTheDocument();
  });

  it('sends the pdf and chart id', async () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalled());
    const [name, body] = mocks.invoke.mock.calls[0] as unknown as [string, Record<string, string>];
    expect(name).toBe('send-owner-report');
    expect(body.chartId).toBe('c1');
    expect(body.filename).toBe('rex_owner_report.pdf');
    expect(body.subject).toContain('Rex');
    expect(body.body).toContain('Elm Vet');
    expect(atob(body.pdfBase64)).toBe(pdfText);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('sam@example.com'), expect.anything());
  });

  it('shows the server error in the user language', async () => {
    mocks.invoke.mockRejectedValueOnce(
      new ApiError(i18n.t('errors.api.daily_owner_report_limit', { ns: 'common' }), 'daily_owner_report_limit', 'x', 429),
    );
    setup();
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Daily report email limit reached/);
  });
});

it('revalidates the PDF after encoding and sends nothing when review was revoked', async () => {
  mocks.invoke.mockClear();
  let reader!: FileReader;
  const read = vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) { reader = this; });
  let currentPdf: ReturnType<typeof getPdf> | null = getPdf();
  render(<OwnerReportEmailModal open onClose={vi.fn()} chartId="c1" practiceId="p1" practiceName="Elm Vet" toEmail="sam@example.com" patientName="Rex" ownerName="Sam" getPdf={() => currentPdf} />);
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
  expect(reader).toBeDefined();
  currentPdf = null;
  await act(async () => {
    Object.defineProperty(reader, 'result', { value: 'data:application/pdf;base64,JVBERg==' });
    reader.onload?.(new ProgressEvent('load') as ProgressEvent<FileReader>);
  });
  expect(mocks.invoke).not.toHaveBeenCalled();
  read.mockRestore();
});

it('does not send when the final attachment validation fails', async () => {
  mocks.invoke.mockClear();
  const validate = vi.fn(async () => false);
  render(<OwnerReportEmailModal open onClose={vi.fn()} chartId="c1" practiceId="p1" practiceName="Elm Vet" toEmail="sam@example.com" patientName="Rex" ownerName="Sam" getPdf={getPdf} validatePdf={validate} />);
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
  await waitFor(() => expect(validate).toHaveBeenCalledOnce());
  expect(mocks.invoke).not.toHaveBeenCalled();
});
