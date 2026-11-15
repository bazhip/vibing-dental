import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import type { UseAttachmentsReturn } from '../hooks/useAttachments';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  choose: vi.fn(async () => 'add' as string | null),
}));
vi.mock('../hooks/useAttachments', () => ({
  useAttachments: () => ({ enabled: true, loaded: true, items: [] }) as unknown as UseAttachmentsReturn,
}));
vi.mock('../utils/ownerReportPdf', () => ({ buildOwnerReportPdfBytes: vi.fn(async () => new Uint8Array([37, 80, 68, 70, 45])) }));
vi.mock('../utils/svgToPng', () => ({ diagramSvgToPng: vi.fn(async () => new Uint8Array()) }));
vi.mock('./PdfPagesPreview', () => ({ canShowPdfInline: () => true, PdfPagesPreview: () => <div /> }));
vi.mock('./OwnerReportEmailModal', () => ({
  OwnerReportEmailModal: (p: { open: boolean }) => (p.open ? <div>email-composer</div> : null),
}));
vi.mock('./ui/dialogs', async (orig) => ({
  ...(await orig<typeof import('./ui/dialogs')>()),
  toast: mocks.toast,
  chooseDialog: mocks.choose,
}));

import { OwnerReportModal } from './OwnerReportModal';
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
  render(<OwnerReportModal {...props} />);
  return props;
}

const emailButton = () => screen.getByRole('button', { name: /email to owner/i });

describe('OwnerReportModal — email to owner', () => {
  beforeEach(() => { mocks.toast.mockClear(); mocks.choose.mockClear(); });

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
