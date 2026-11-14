import React from 'react';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import i18n, { loadLanguage } from '../i18n';
import { formatDate } from '../i18n/format';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS, ExamFindings, PatientInfo } from '../types';
import { decodeDicom } from '../utils/dicom';
import type { Attachment, UseAttachmentsReturn } from '../hooks/useAttachments';
import * as attachments from '../hooks/useAttachments';
import { PatientForm } from './PatientForm';
import { ExamForm } from './ExamForm';
import { AnesthesiaForm } from './AnesthesiaForm';
import { AnesthesiaCustomEditor } from './AnesthesiaCustomEditor';
import { ExamAreasEditor } from './ExamAreasEditor';
import { SurgeryReportForm } from './SurgeryReportForm';
import { ImagingSection } from './ImagingSection';
import { DocumentsModal } from './DocumentsModal';

// The report-template store and the attachment hook talk to Supabase; swap in plain state.
const templateStore = vi.hoisted(() => ({
  enabled: true,
  loaded: true,
  templates: [] as { id: string; name: string; body: string }[],
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('../hooks/useReportTemplates', () => ({ useReportTemplates: () => templateStore }));

const imaging = vi.hoisted(() => ({ override: null as unknown }));
vi.mock('../hooks/useAttachments', async (orig) => {
  const actual = await orig<typeof import('../hooks/useAttachments')>();
  return {
    ...actual,
    useAttachments: (...args: Parameters<typeof actual.useAttachments>) =>
      (imaging.override as UseAttachmentsReturn | null) ?? actual.useAttachments(...args),
  };
});
// A truthy client lets the real upload() reach its validation; cloud stays off so nothing loads.
vi.mock('../utils/supabaseClient', async (orig) => ({ ...(await orig<typeof import('../utils/supabaseClient')>()), supabase: {}, cloudEnabled: false }));
// The two PDF previews are other screens: stub them so the modal's own text is what's checked.
vi.mock('./PdfPreviewModal', () => ({ PdfPreviewModal: () => <div data-testid="pdf-preview" /> }));
vi.mock('./OwnerReportModal', () => ({ OwnerReportModal: () => <div data-testid="owner-preview" /> }));
vi.mock('./ui/dialogs', async (orig) => ({
  ...(await orig<typeof import('./ui/dialogs')>()),
  promptDialog: vi.fn(async () => 'Routine cleaning'),
  confirmDialog: vi.fn(async () => true),
  toast: vi.fn(),
}));

beforeEach(installPseudoLocale);
afterEach(async () => {
  cleanup(); // unmount before the stubs change, so no component re-renders against the wrong hook
  imaging.override = null;
  templateStore.templates = [];
  await restoreLocale();
});

// Fixture data and genuine units/codes only: pet and owner names the test types in, a drug name,
// dose strings, the mL unit, DICOM (a file format, shown as a badge) and the custom
// field/block names a user would have defined.
const ALLOW: (string | RegExp)[] = [
  'Rex', 'Ann Lee', 'Dr. Sharma', 'Bupivacaine', 'Lidocaine', 'Ropivacaine', 'Major palatine', 'ET tube', 'ASA status',
  'Premed note', 'Cleaning', 'Routine cleaning', 'Pre-op', 'mL', 'mg/mL', 'mm', 'Buprenorphine', 'DICOM', 'DICOM ↓', 'Gum swelling', 'Soft', 'Scaled and polished', 'I', 'II',
  /^0\.5% Bupivacaine$/,
  /^Rex · \d{4}-\d{2}-\d{2}$/,
];

const patient: PatientInfo = {
  patientName: 'Rex', patientNumber: '1234', ownerName: 'Ann Lee', ownerPhone: '555', ownerEmail: 'a@b.co',
  doctor: '', tech: 'Dr. Sharma', date: '2026-03-05', complaint: 'Gum swelling', treatmentReport: '',
  recallDate: '2026-09-05', nerveBlocks: EMPTY_NERVE_BLOCKS, exam: EMPTY_EXAM_FINDINGS,
};

describe('PatientForm', () => {
  it('empty and filled, with and without the recheck field', () => {
    const noop = () => {};
    const { container, rerender } = render(
      <PatientForm patientInfo={{ ...patient, patientName: '', patientNumber: '', date: '', recallDate: '', ownerName: '', ownerPhone: '', ownerEmail: '', tech: '', complaint: '' }} species="canine" onPatientInfoChange={noop} onSpeciesChange={noop} onCustomize={noop} />,
    );
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    rerender(<PatientForm patientInfo={patient} species="feline-deciduous" onPatientInfoChange={noop} onSpeciesChange={noop} hideRecheck />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    expect(screen.getByPlaceholderText('⟦Optional⟧')).toBeInTheDocument();
  });

  it('picking a recheck interval fills the date', () => {
    const onChange = vi.fn();
    render(<PatientForm patientInfo={patient} species="canine" onPatientInfoChange={onChange} onSpeciesChange={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Set the recheck date/), { target: { value: '7' } });
    expect(onChange).toHaveBeenCalledWith('recallDate', '2026-03-12');
  });
});

describe('ExamForm', () => {
  const noop = () => {};
  it('unanswered, partly answered with an abnormal comment, fully answered', () => {
    const exam: ExamFindings = {
      ...EMPTY_EXAM_FINDINGS,
      lymph: { status: 'normal', comment: '' },
      tongue: { status: 'abnormal', comment: 'Soft' },
    };
    const { container, rerender } = render(<ExamForm exam={EMPTY_EXAM_FINDINGS} onStatusChange={noop} onCommentChange={noop} />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    expect(screen.getByText('⟦Mark all normal⟧')).toBeInTheDocument();
    rerender(<ExamForm exam={exam} onStatusChange={noop} onCommentChange={noop} />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    expect(screen.getByText('⟦Mark the rest normal⟧')).toBeInTheDocument();
    const done = Object.fromEntries(Object.keys(EMPTY_EXAM_FINDINGS).map((k) => [k, { status: 'normal', comment: '' }])) as unknown as ExamFindings;
    rerender(<ExamForm exam={done} onStatusChange={noop} onCommentChange={noop} />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
  });

  it('with custom areas (one abnormal) and Customize', () => {
    const { container } = render(
      <ExamForm
        exam={EMPTY_EXAM_FINDINGS}
        onStatusChange={noop}
        onCommentChange={noop}
        customRows={[
          { id: 'x1', label: 'Lips', status: '', comment: '' },
          { id: 'x2', label: 'Salivary ducts', status: 'abnormal', comment: 'Soft' },
        ]}
        onCustomChange={noop}
        onCustomize={noop}
      />,
    );
    expect(findUntranslated(container, [...ALLOW, 'Lips', 'Salivary ducts', /^⟦.*Salivary ducts.*⟧$/])).toEqual([]);
  });
});

describe('ExamAreasEditor', () => {
  it('empty, with areas, and once the preset is added', () => {
    const noop = () => {};
    const { container, unmount } = render(<ExamAreasEditor areas={[]} onChange={noop} />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: /⟦Add the full oral exam list⟧/ }));
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    unmount();
    const second = render(<ExamAreasEditor areas={[{ id: 'x1', label: 'Lips' }]} onChange={noop} />);
    expect(findUntranslated(second.container, [...ALLOW, 'Lips', /^⟦Remove Lips⟧$/])).toEqual([]);
  });
});

describe('AnesthesiaForm', () => {
  const noop = () => {};
  const props = { onNerveBlockChange: noop, onDrugsChange: noop, logo: 'vca' as const };
  it('empty, with the usual drug offered, two drugs, and custom blocks and fields', () => {
    const { container, rerender } = render(<AnesthesiaForm nerveBlocks={EMPTY_NERVE_BLOCKS} {...props} usualDrug={{ name: 'Bupivacaine', concentration: '0.5' }} onCustomize={noop} />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    rerender(<AnesthesiaForm nerveBlocks={EMPTY_NERVE_BLOCKS} {...props} usualDrug={{ name: 'Bupivacaine', concentration: '0.5' }} usualAdjunct={{ name: 'Buprenorphine', concentration: '0.3 mg/mL' }} />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    rerender(
      <AnesthesiaForm
        {...props}
        nerveBlocks={{ ...EMPTY_NERVE_BLOCKS, other: 'Soft', mentalRight: '0.2', drugs: [{ name: 'Bupivacaine', concentration: '0.5' }, { name: 'Buprenorphine', concentration: '0.3 mg/mL' }] }}
        customBlockDefs={[{ id: 'b1', label: 'Major palatine' }]}
        customFieldDefs={[
          { id: 'f1', label: 'ET tube', type: 'number', unit: 'mm' },
          { id: 'f2', label: 'ASA status', type: 'select', options: ['I', 'II'] },
          { id: 'f3', label: 'Premed note', type: 'checkbox' },
        ]}
        customValues={{ blocks: [], fields: [] }}
        hiddenBlocks={['mental']}
      />,
    );
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    expect(screen.getByText('⟦Anesthetics⟧')).toBeInTheDocument();
    expect(screen.getByLabelText('⟦Anesthetic 2 name⟧')).toBeInTheDocument();
  });
});

describe('AnesthesiaCustomEditor', () => {
  it('empty and with a block and a field of each type', () => {
    const noop = () => {};
    const { container, rerender } = render(<AnesthesiaCustomEditor blocks={[]} fields={[]} onBlocksChange={noop} onFieldsChange={noop} />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    rerender(
      <AnesthesiaCustomEditor
        blocks={[{ id: 'b1', label: 'Major palatine' }]}
        fields={[
          { id: 'f1', label: 'ET tube', type: 'number', unit: 'mm' },
          { id: 'f2', label: 'ASA status', type: 'select', options: ['I', 'II'] },
        ]}
        onBlocksChange={noop}
        onFieldsChange={noop}
      />,
    );
    expect(findUntranslated(container, ALLOW)).toEqual([]);
  });
});

describe('SurgeryReportForm', () => {
  it('without templates, loading, empty and with templates', async () => {
    const { container, rerender } = render(<SurgeryReportForm value="" onChange={() => {}} cloudActive={false} />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    templateStore.loaded = false;
    rerender(<SurgeryReportForm value="" onChange={() => {}} />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    templateStore.loaded = true;
    rerender(<SurgeryReportForm value="" onChange={() => {}} />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    templateStore.templates = [{ id: 't1', name: 'Cleaning', body: 'x' }, { id: 't2', name: '  ', body: 'y' }];
    rerender(<SurgeryReportForm value="Scaled and polished" onChange={() => {}} />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    expect(screen.getByText('⟦Untitled⟧')).toBeInTheDocument();
  });

  it('saving a template toasts a translated message', async () => {
    const { toast } = await import('./ui/dialogs');
    templateStore.create.mockResolvedValueOnce(undefined);
    render(<SurgeryReportForm value="Scaled" onChange={() => {}} />);
    fireEvent.click(screen.getByText('⟦Save as template⟧'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('⟦Template “Routine cleaning” saved.⟧', { kind: 'success' }));
  });
});

describe('ImagingSection', () => {
  const photo: Attachment = {
    id: 'a1', chartId: 'c', path: 'p', caption: 'Pre-op', kind: 'photo', toothTriadan: null, createdAt: '',
    url: 'https://x/a.jpg', thumbUrl: 'https://x/a.thumb.jpg', originalPath: null, originalUrl: '',
  };
  const store = (over: Partial<UseAttachmentsReturn> = {}): UseAttachmentsReturn => ({
    enabled: true, loaded: true, items: [photo], maxImages: 5, dicomEnabled: true,
    upload: vi.fn(), updateCaption: vi.fn(), updateKind: vi.fn(), remove: vi.fn(), ...over,
  });
  const noop = () => {};

  it('signed out, free plan, loading and empty', () => {
    const { container, rerender } = render(<ImagingSection chartId="c" cloudActive={false} />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    // A new key remounts: the real hook (signed out) and the stub call different hooks.
    for (const [i, over] of [{ maxImages: 0, items: [] }, { loaded: false, items: [] }, { items: [] }].entries()) {
      imaging.override = store(over);
      rerender(<ImagingSection key={i} chartId="c" cloudActive />);
      expect(findUntranslated(container, ALLOW)).toEqual([]);
    }
  });

  it('with one image and with three, owner-report tags, PDF options, a DICOM original', () => {
    const three = [photo, { ...photo, id: 'a2', caption: '', kind: 'xray' as const, originalPath: 'o', originalUrl: 'https://x/o.dcm' }, { ...photo, id: 'a3', url: '', thumbUrl: '', originalPath: 'o2', kind: 'xray' as const }];
    const props = { chartId: 'c', cloudActive: true, onImageRoleChange: noop, onIncludeInPdfChange: noop, onImageInPdfChange: noop, onCustomize: noop };
    imaging.override = store();
    const { container, rerender } = render(<ImagingSection {...props} />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    expect(screen.getByText('⟦1 of 5 images⟧')).toBeInTheDocument();
    imaging.override = store({ items: three, dicomEnabled: false });
    rerender(<ImagingSection {...props} pdfExcludedImages={['a2']} />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    rerender(<ImagingSection {...props} readOnly />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
  });

  it('shows a translated DICOM error and a translated caption error', async () => {
    imaging.override = store({
      upload: vi.fn(async () => { decodeDicom(new Uint8Array(300)); }),
      updateCaption: vi.fn(async () => { throw new Error('x'); }),
    });
    const { container } = render(<ImagingSection chartId="c" cloudActive />);
    const file = new File([new Uint8Array(300)], 'scan.dcm', { type: 'application/dicom' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/^⟦.*DICOM.*⟧$/);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    const caption = screen.getByLabelText('⟦Caption⟧');
    fireEvent.change(caption, { target: { value: 'New' } });
    fireEvent.blur(caption);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/caption/));
    expect(findUntranslated(container, ALLOW)).toEqual([]);
  });
});

describe('upload errors from useAttachments', () => {
  it('are in the active language', async () => {
    const real = await vi.importActual<typeof attachments>('../hooks/useAttachments');
    const { result } = renderHook(() => real.useAttachments('c', 'p', 1, false));
    const bad = new File([new Uint8Array(10)], 'x.gif', { type: 'image/gif' });
    await expect(result.current.upload(bad, 'photo', '')).rejects.toThrow(/^⟦Use a PNG, JPEG, or WEBP image\.⟧$/);
    const dcm = new File([new Uint8Array(10)], 'x.dcm');
    await expect(result.current.upload(dcm, 'photo', '')).rejects.toThrow(/^⟦DICOM uploads are included on paid plans/);
  });
});

describe('DocumentsModal', () => {
  const owner = {
    snapshot: { patientInfo: patient } as never, branding: {} as never, imageRoles: {}, chartId: 'c', practiceId: 'p',
    cloudActive: true, onEditWording: () => {},
  };
  it('chart only, and with the owner-report tab', () => {
    const snap = { patientInfo: patient } as never;
    const { rerender } = render(<DocumentsModal open onClose={() => {}} chartSnapshot={snap} />);
    expect(findUntranslated(document.body, ALLOW)).toEqual([]);
    expect(screen.queryByRole('tablist')).toBeNull();
    rerender(<DocumentsModal open onClose={() => {}} chartSnapshot={snap} ownerReport={owner} initialTab="owner" />);
    expect(findUntranslated(document.body, ALLOW)).toEqual([]);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByTestId('owner-preview')).toBeInTheDocument();
  });
});

describe('French', () => {
  it('formats the visit date in French', async () => {
    await loadLanguage('fr');
    expect(formatDate('2026-03-05', 'long', 'fr')).toBe('5 mars 2026');
    await i18n.changeLanguage('fr');
    render(<ExamForm exam={EMPTY_EXAM_FINDINGS} onStatusChange={() => {}} onCommentChange={() => {}} />);
    expect(screen.getByText('Examen')).toBeInTheDocument();
  });
});
