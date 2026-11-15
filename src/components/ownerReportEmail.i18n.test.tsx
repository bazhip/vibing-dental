import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import i18n from '../i18n';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import type { UseAttachmentsReturn } from '../hooks/useAttachments';

vi.mock('../hooks/usePracticeLanguage', () => ({
  usePracticeLanguage: () => ({ language: 'en', explicit: true, loaded: true, save: vi.fn() }),
}));
vi.mock('../hooks/useAttachments', () => ({
  useAttachments: () => ({ enabled: true, loaded: true, items: [] }) as unknown as UseAttachmentsReturn,
}));
vi.mock('../utils/ownerReportPdf', () => ({ buildOwnerReportPdfBytes: vi.fn(async () => new Uint8Array([37, 80, 68, 70, 45])) }));
vi.mock('../utils/svgToPng', () => ({ diagramSvgToPng: vi.fn(async () => new Uint8Array()) }));
vi.mock('./PdfPagesPreview', () => ({ canShowPdfInline: () => true, PdfPagesPreview: () => <div /> }));

import { OwnerReportEmailModal } from './OwnerReportEmailModal';
import { OwnerReportModal } from './OwnerReportModal';
import { sampleOwnerReportSnapshot } from '../utils/ownerReportSample';
import { reportStrings } from '../utils/ownerReportI18n';

beforeAll(() => {
  URL.createObjectURL = URL.createObjectURL ?? (() => 'blob:x');
  URL.revokeObjectURL = URL.revokeObjectURL ?? (() => {});
});
beforeEach(async () => { await installPseudoLocale(); });
afterEach(async () => { cleanup(); await restoreLocale(); });

describe('Owner report email (pseudo-locale)', () => {
  it('the composer translates every UI string', () => {
    const { container } = render(
      <OwnerReportEmailModal
        open
        onClose={() => {}}
        chartId="c1"
        practiceId="p1"
        practiceName="Elm Vet"
        toEmail="sam@example.com"
        patientName="Rex"
        ownerName="Sam"
        getPdf={() => ({ blob: new Blob(['%PDF-']), filename: 'rex.pdf' })}
      />,
    );
    // Subject and message are client-language defaults (the owner reads them), not UI copy.
    const ct = i18n.getFixedT('en', 'client');
    const vars = { pet: 'Rex', owner: 'Sam', practice: 'Elm Vet' };
    expect(findUntranslated(container, [ct('ownerReportEmail.subject', vars), ct('ownerReportEmail.body', vars)])).toEqual([]);
  });

  it('the owner report shows a translated Email to owner button', async () => {
    const strings = reportStrings('en');
    const { container } = render(
      <OwnerReportModal
        open
        bare
        onClose={() => {}}
        snapshot={sampleOwnerReportSnapshot()}
        branding={{ practiceName: 'Elm Vet', doctorName: '', logoUrl: '' }}
        imageRoles={{}}
        chartId="c1"
        practiceId="p1"
        cloudActive
        ownerEmail="sam@example.com"
        ensureSaved={async () => true}
        onEditPatient={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText(/Email to owner/)).toBeInTheDocument());
    expect(findUntranslated(container, [strings.intro('{pet}'), ...strings.homecareTips])).toEqual([]);
  });
});
