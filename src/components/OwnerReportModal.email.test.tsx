import React from 'react';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';
import type { UseAttachmentsReturn, Attachment } from '../hooks/useAttachments';

const mocks = vi.hoisted(() => ({
  items: [] as Attachment[],
  validatePdf: undefined as (() => Promise<boolean>) | undefined,
  toast: vi.fn(),
  choose: vi.fn(async () => 'add' as string | null),
}));
vi.mock('../hooks/useAttachments', () => ({
  listChartAttachments: async () => mocks.items,
  useAttachments: () => ({ enabled: true, loaded: true, items: mocks.items }) as unknown as UseAttachmentsReturn,
}));
vi.mock('../utils/ownerReportPdf', () => ({ buildOwnerReportPdfBytes: vi.fn(async () => new Uint8Array([37, 80, 68, 70, 45])) }));
vi.mock('../utils/svgToPng', () => ({ diagramSvgToPng: vi.fn(async () => new Uint8Array()) }));
vi.mock('./PdfPagesPreview', () => ({ canShowPdfInline: () => true, PdfPagesPreview: () => <div /> }));
vi.mock('./OwnerReportEmailModal', () => ({
  OwnerReportEmailModal: (p: { open: boolean; validatePdf?: () => Promise<boolean> }) => { mocks.validatePdf = p.validatePdf; return p.open ? <div>email-composer</div> : null; },
}));
vi.mock('./ui/dialogs', async (orig) => ({
  ...(await orig<typeof import('./ui/dialogs')>()),
  toast: mocks.toast,
  chooseDialog: mocks.choose,
}));

import { OwnerReportModal } from './OwnerReportModal';
import { fetchAsJpeg } from '../utils/imageJpeg';
vi.mock('../utils/imageJpeg', () => ({ fetchAsJpeg: vi.fn(async () => new Uint8Array([1])) }));
import { buildOwnerReportPdfBytes } from '../utils/ownerReportPdf';
import { ownerReportReviewBasis, ownerReportAttachmentBasis } from '../utils/ownerReport';
import { sampleOwnerReportSnapshot } from '../utils/ownerReportSample';

beforeAll(() => {
  URL.createObjectURL = URL.createObjectURL ?? (() => 'blob:x');
  URL.revokeObjectURL = URL.revokeObjectURL ?? (() => {});
});

function setup(over: Partial<React.ComponentProps<typeof OwnerReportModal>> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    snapshot: sampleOwnerReportSnapshot(),
    branding: { practiceName: 'Elm Vet', doctorName: '', logoUrl: '' },
    imageRoles: {},
    chartId: 'c1',
    practiceId: 'p1',
    cloudActive: true,
    ownerEmail: 'sam@example.com',
    ensureSaved: vi.fn(async () => true),
    onEditPatient: vi.fn(),
    ...over,
  };
  if (!over.snapshot) props.snapshot = { ...props.snapshot, ownerReport: { ...props.snapshot.ownerReport, reviewedBasis: ownerReportReviewBasis(props.snapshot, { practiceName: props.branding.practiceName, doctorName: props.branding.doctorName, config: props.config }) } };
  const view = render(<OwnerReportModal {...props} />);
  return { ...props, rerender: view.rerender };
}

const emailButton = () => screen.getByRole('button', { name: /email to owner/i });

describe('OwnerReportModal — email to owner', () => {
  beforeEach(() => { mocks.toast.mockClear(); mocks.choose.mockClear(); mocks.items = []; });

  it('saves before sending; blocks when the save fails', async () => {
    const props = setup({ ensureSaved: vi.fn(async () => false) });
    await waitFor(() => expect(emailButton()).toBeEnabled());
    fireEvent.click(emailButton());
    await waitFor(() => expect(props.ensureSaved).toHaveBeenCalled());
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.stringMatching(/save the chart/i), expect.anything()));
    expect(screen.queryByText('email-composer')).toBeNull();
  });

  it('opens the composer once the chart is saved', async () => {
    setup();
    await waitFor(() => expect(emailButton()).toBeEnabled());
    fireEvent.click(emailButton());
    expect(await screen.findByText('email-composer')).toBeInTheDocument();
  });

  it('no owner email → offers to add one', async () => {
    const props = setup({ ownerEmail: '  ' });
    await waitFor(() => expect(emailButton()).toBeEnabled());
    fireEvent.click(emailButton());
    await waitFor(() => expect(mocks.choose).toHaveBeenCalled());
    await waitFor(() => expect(props.onEditPatient).toHaveBeenCalled());
    expect(props.ensureSaved).not.toHaveBeenCalled();
  });

  it('is disabled without an account', () => {
    setup({ cloudActive: false });
    expect(emailButton()).toBeDisabled();
  });

  it('is absent when the host gives no email wiring', () => {
    setup({ ensureSaved: undefined });
    expect(screen.queryByRole('button', { name: /email to owner/i })).toBeNull();
  });
});

it('keeps an unreviewed owner report in draft and blocks owner email', async () => {
  setup({ snapshot: { ...sampleOwnerReportSnapshot(), ownerReport: {} } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download draft PDF' })).toBeEnabled());
  expect(emailButton()).toBeDisabled();
  expect(screen.getByText('Draft — review required')).toBeInTheDocument();
});

const photo = { id: 'p', path: 'image.jpg', caption: 'Before', kind: 'photo', toothTriadan: null, url: 'https://example.test/photo' } as Attachment;
function reviewedPhotoSnapshot() {
  const snapshot = { ...sampleOwnerReportSnapshot(), imageRoles: { p: 'before' as const } };
  return { ...snapshot, ownerReport: { ...snapshot.ownerReport, reviewedBasis: ownerReportReviewBasis(snapshot, { practiceName: 'Elm Vet', doctorName: '' }), reviewedAttachments: ownerReportAttachmentBasis([photo], snapshot.imageRoles) } };
}
it('caption changes invalidate reviewed export and rebuild the PDF as draft', async () => {
  mocks.items = [photo];
  const props = setup({ snapshot: reviewedPhotoSnapshot(), imageRoles: { p: 'before' } });
  await waitFor(() => expect(emailButton()).toBeEnabled());
  mocks.items = [{ ...photo, caption: 'Changed clinical caption' }];
  props.rerender(<OwnerReportModal {...props} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download draft PDF' })).toBeEnabled());
  expect(emailButton()).toBeDisabled();
  expect(vi.mocked(buildOwnerReportPdfBytes).mock.lastCall?.[0].reviewed).toBe(false);
});
it('failed report photos cannot produce a reviewed PDF or enable email', async () => {
  mocks.items = [photo];
  vi.mocked(fetchAsJpeg).mockResolvedValueOnce(null);
  setup({ snapshot: reviewedPhotoSnapshot(), imageRoles: { p: 'before' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download draft PDF' })).toBeEnabled());
  expect(emailButton()).toBeDisabled();
  expect(screen.getByText(/Some report images could not be loaded/)).toBeInTheDocument();
  expect(vi.mocked(buildOwnerReportPdfBytes).mock.lastCall?.[0].reviewed).toBe(false);
});

it('fresh validation blocks email when a photo changed on the server after preview loaded', async () => {
  mocks.items = [photo];
  setup({ snapshot: reviewedPhotoSnapshot(), imageRoles: { p: 'before' } });
  await waitFor(() => expect(emailButton()).toBeEnabled());
  mocks.items = [{ ...photo, caption: 'Changed remotely' }];
  let valid = true;
  await act(async () => { valid = await mocks.validatePdf!(); });
  expect(valid).toBe(false);
  expect(emailButton()).toBeDisabled();
});
