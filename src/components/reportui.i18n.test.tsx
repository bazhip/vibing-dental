import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import i18n, { loadLanguage } from '../i18n';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import type { UseTeamReturn } from '../hooks/useTeam';
import type { UseAttachmentsReturn, Attachment } from '../hooks/useAttachments';

const teamState = vi.hoisted(() => ({ role: 'owner' as string, loaded: true }));
const attachmentsState = vi.hoisted(() => ({ items: [] as unknown[] }));
const pdf = vi.hoisted(() => ({ build: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));

vi.mock('../hooks/useTeam', () => ({ useTeam: () => teamState as unknown as UseTeamReturn }));
vi.mock('../hooks/useAttachments', () => ({
  useAttachments: () => ({ enabled: true, loaded: true, items: attachmentsState.items }) as unknown as UseAttachmentsReturn,
}));
vi.mock('../utils/ownerReportPdf', () => ({ buildOwnerReportPdfBytes: pdf.build }));
vi.mock('../utils/imageJpeg', () => ({ fetchAsJpeg: vi.fn(async () => new Uint8Array([1])) }));
vi.mock('../utils/svgToPng', () => ({ diagramSvgToPng: vi.fn(async () => new Uint8Array()) }));
vi.mock('./PdfPagesPreview', () => ({
  canShowPdfInline: () => true,
  PdfPagesPreview: () => <div />,
}));

import { OwnerReportModal } from './OwnerReportModal';
import { OwnerReportSection } from './OwnerReportSection';
import { OwnerReportCustomize } from './OwnerReportCustomize';
import { OwnerReportTemplatesModal } from './OwnerReportTemplatesModal';
import { defaultConfig, defaultTemplate, defaultSectionTitle, BUILT_IN_SECTION_IDS, type OwnerReportConfig } from '../utils/ownerReportConfig';
import { appReportLocale, reportStrings, type ReportLocale } from '../utils/ownerReportI18n';
import { buildOwnerReportModel } from '../utils/ownerReport';
import { sampleOwnerReportSnapshot } from '../utils/ownerReportSample';

beforeAll(() => {
  URL.createObjectURL = URL.createObjectURL ?? (() => 'blob:x');
  URL.revokeObjectURL = URL.revokeObjectURL ?? (() => {});
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});
beforeEach(async () => {
  teamState.role = 'owner';
  teamState.loaded = true;
  attachmentsState.items = [];
  pdf.build.mockClear();
  await installPseudoLocale();
});
afterEach(async () => {
  cleanup();
  await restoreLocale();
});

const branding = { practiceName: 'Elm Vet', doctorName: 'Dr Kaser', logoUrl: '' };
const snapshot = sampleOwnerReportSnapshot();
const noop = () => {};

/** Report content (the template's language, not the app's) is never wrapped by the pseudo-locale. */
function reportContent(...langs: ReportLocale[]): string[] {
  return langs.flatMap((lng) => {
    const strings = reportStrings(lng);
    return [
      strings.intro('{pet}'),
      ...strings.homecareTips,
      ...BUILT_IN_SECTION_IDS.map((id) => strings.headings[id]('{pet}')),
    ];
  });
}

const twoTemplates = (): OwnerReportConfig => ({
  defaultTemplateId: 'a',
  templates: [
    { ...defaultTemplate(), id: 'a', name: 'Standard' },
    { ...defaultTemplate('es'), id: 'b', name: 'Cat dentals' },
  ],
});

describe('OwnerReportTemplatesModal', () => {
  const props = { open: true, onClose: noop, onSave: vi.fn(async () => {}), canEdit: true, roleKnown: true, branding };
  const allow = [
    'Standard', 'Cat dentals', 'Elm Vet', 'Dr Kaser', /^[A-Z]{2}$/, /^\{\w+\}$/,
    ...reportContent('en', 'es'),
    ...BUILT_IN_SECTION_IDS.map(defaultSectionTitle),
  ];

  it('an English template, a Spanish one with custom text and tips, and a read-only view', () => {
    const { container, rerender } = render(<OwnerReportTemplatesModal {...props} config={twoTemplates()} />);
    expect(findUntranslated(container, allow)).toEqual([]);
    expect(screen.getByText('⟦Owner report templates⟧')).toBeInTheDocument();

    const custom = twoTemplates();
    custom.templates[0].sections.push({ id: 'custom-1', enabled: true, title: '', body: '' });
    custom.templates[0].homecareTips = ['Brush daily'];
    rerender(<OwnerReportTemplatesModal {...props} config={custom} />);
    expect(findUntranslated(container, [...allow, 'Brush daily'])).toEqual([]);

    custom.defaultTemplateId = 'b';
    rerender(<OwnerReportTemplatesModal {...props} config={custom} />);
    fireEvent.click(screen.getByRole('button', { name: /Cat dentals/ }));
    expect(findUntranslated(container, [...allow, 'Brush daily'])).toEqual([]);

    rerender(<OwnerReportTemplatesModal {...props} config={custom} canEdit={false} />);
    expect(findUntranslated(container, [...allow, 'Brush daily'])).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent('⟦Only practice owners can edit.');
  });

  it('building the sample preview and a failed preview', async () => {
    const { container } = render(<OwnerReportTemplatesModal {...props} config={defaultConfig()} />);
    fireEvent.click(screen.getByRole('button', { name: '⟦Preview with sample visit⟧' }));
    await waitFor(() => expect(screen.getByTitle('⟦Owner report template preview⟧')).toBeInTheDocument());
    expect(findUntranslated(container, [...allow, /^Preview/])).toEqual([]);
  });

  it('a template created while the app language is German is a German template', async () => {
    await loadLanguage('de');
    await i18n.changeLanguage('de');
    const onSave = vi.fn(async () => {});
    render(<OwnerReportTemplatesModal {...props} onSave={onSave} config={defaultConfig()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Neu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vorlagen speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = (onSave.mock.calls[0] as unknown as [OwnerReportConfig])[0];
    expect(saved.templates).toHaveLength(2);
    expect(saved.templates[1]).toMatchObject({
      name: 'Neue Vorlage',
      language: 'de',
      title: reportStrings('de').defaultTitle,
    });
    expect(saved.templates[0].language).toBe('en');
  });

  it('a new template uses the practice client language, not the app language', async () => {
    await loadLanguage('fr');
    await i18n.changeLanguage('fr');
    const onSave = vi.fn(async () => {});
    render(<OwnerReportTemplatesModal {...props} onSave={onSave} config={defaultConfig()} clientLanguage="de" />);
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau' }));
    fireEvent.click(screen.getByRole('button', { name: /^Enregistrer/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = (onSave.mock.calls[0] as unknown as [OwnerReportConfig])[0];
    expect(saved.templates[1]).toMatchObject({ language: 'de', title: reportStrings('de').defaultTitle });
  });

  it('a template created in an app language reports do not cover (pseudo-locale) is saved as English', async () => {
    const onSave = vi.fn(async () => {});
    render(<OwnerReportTemplatesModal {...props} onSave={onSave} config={defaultConfig()} />);
    fireEvent.click(screen.getByRole('button', { name: '⟦New⟧' }));
    fireEvent.click(screen.getByRole('button', { name: '⟦Save templates⟧' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = (onSave.mock.calls[0] as unknown as [OwnerReportConfig])[0];
    expect(saved.templates).toHaveLength(2);
    expect(saved.templates[1]).toMatchObject({ language: 'en', title: reportStrings('en').defaultTitle });
  });
});

describe('appReportLocale', () => {
  it('follows the app language when reports cover it, else English', async () => {
    await i18n.changeLanguage('ja');
    expect(appReportLocale()).toBe('en');
    await i18n.changeLanguage('xx');
    expect(appReportLocale()).toBe('en');
    await loadLanguage('it');
    await i18n.changeLanguage('it');
    expect(appReportLocale()).toBe('it');
  });
});

describe('OwnerReportCustomize', () => {
  it('opens the editor for owners and shows the read-only note to others', () => {
    const allow = ['Standard', 'Elm Vet', 'Dr Kaser', /^[A-Z]{2}$/, /^\{\w+\}$/, ...reportContent('en'), ...BUILT_IN_SECTION_IDS.map(defaultSectionTitle)];
    const { container, unmount } = render(<OwnerReportCustomize onClose={noop} config={defaultConfig()} onSave={async () => {}} branding={branding} />);
    expect(findUntranslated(container, allow)).toEqual([]);
    expect(screen.getByRole('button', { name: '⟦Save templates⟧' })).toBeDisabled();
    unmount();
    teamState.role = 'member';
    const second = render(<OwnerReportCustomize onClose={noop} config={defaultConfig()} onSave={async () => {}} branding={branding} />);
    expect(findUntranslated(second.container, allow)).toEqual([]);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('OwnerReportSection', () => {
  const previewAllow = (container: HTMLElement, snap = snapshot) => {
    const model = buildOwnerReportModel(snap);
    const text = [
      ...model.extracted,
      model.extracted.join(', '),
      ...model.teeth.flatMap((tooth) => [tooth.layName, tooth.notes.join('; ')]),
      model.examNotes.map((n) => `${n.area}${n.comment ? ` (${n.comment})` : ''}`).join(' · '),
      model.recallDate,
      reportStrings('en').intro('Biscuit'),
      ...reportStrings('en').homecareTips,
    ].filter(Boolean) as string[];
    return [...text, /^Biscuit/, ...[...container.querySelectorAll('textarea')].map((t) => t.value)];
  };

  it('with findings, an edited text, a second template, and AI on', () => {
    const context = { config: twoTemplates(), practiceName: 'Elm Vet', doctorName: 'Dr Kaser' };
    const { container, rerender } = render(
      <OwnerReportSection snapshot={snapshot} overrides={{}} onOverrideChange={noop} onPreview={noop} context={context} aiEnabled onCustomize={noop} />,
    );
    expect(findUntranslated(container, [...previewAllow(container), 'Cat dentals', 'Standard', 'Elm Vet'])).toEqual([]);
    expect(screen.getByRole('button', { name: '⟦✨ Write with AI⟧' })).toBeInTheDocument();
    rerender(
      <OwnerReportSection snapshot={snapshot} overrides={{ intro: 'Hello', homecare: 'Brush', templateId: 'b' }} onOverrideChange={noop} onPreview={noop} context={context} readOnly />,
    );
    expect(findUntranslated(container, [...previewAllow(container), 'Cat dentals', 'Standard', 'Elm Vet', 'Hello', 'Brush'])).toEqual([]);
    expect(screen.getAllByText('⟦Reset to generated⟧')).toHaveLength(2);
  });

  it('a chart without findings', () => {
    const empty = { ...snapshot, toothData: [], preComments: [], postComments: [], patientInfo: { ...snapshot.patientInfo, recallDate: '', exam: { ...snapshot.patientInfo.exam } } };
    const { container } = render(<OwnerReportSection snapshot={empty} overrides={{}} onOverrideChange={noop} onPreview={noop} />);
    expect(findUntranslated(container, previewAllow(container, empty))).toEqual([]);
    expect(screen.getByText(/⟦No per-tooth findings recorded yet/)).toBeInTheDocument();
  });
});

describe('OwnerReportModal', () => {
  const photo = (id: string) => ({ id, url: `blob:${id}`, caption: '' }) as unknown as Attachment;
  const baseProps = {
    open: true, onClose: noop, snapshot, branding, chartId: 'c1', practiceId: 'p1', cloudActive: true, onEditWording: noop,
  };

  it('ready, with one tagged photo and with three', async () => {
    attachmentsState.items = [photo('a1')];
    const { container, rerender } = render(<OwnerReportModal {...baseProps} imageRoles={{ a1: 'before' }} />);
    await waitFor(() => expect(container.querySelector('iframe')).toBeInTheDocument());
    expect(findUntranslated(container, [])).toEqual([]);
    expect(screen.getByText('⟦1 before/after photo included.⟧')).toBeInTheDocument();
    expect(screen.getByTitle('⟦Owner report preview⟧')).toBeInTheDocument();

    attachmentsState.items = [photo('a1'), photo('a2'), photo('a3')];
    rerender(<OwnerReportModal {...baseProps} imageRoles={{ a1: 'before', a2: 'after', a3: 'after' }} />);
    await waitFor(() => expect(screen.getByText('⟦3 before/after photos included.⟧')).toBeInTheDocument());
    expect(findUntranslated(container, [])).toEqual([]);
  });

  it('while generating, with no photos tagged, and signed out', async () => {
    const { container, rerender } = render(<OwnerReportModal {...baseProps} imageRoles={{}} />);
    expect(screen.getByText('⟦Generating the owner report…⟧')).toBeInTheDocument();
    expect(findUntranslated(container, [])).toEqual([]);
    await waitFor(() => expect(container.querySelector('iframe')).toBeInTheDocument());
    expect(screen.getByText('⟦Tag photos Before/After in Images to include them.⟧')).toBeInTheDocument();
    rerender(<OwnerReportModal {...baseProps} cloudActive={false} imageRoles={{}} bare />);
    expect(screen.getByText('⟦Photos need a signed-in account.⟧')).toBeInTheDocument();
  });

  it('a failed build', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    pdf.build.mockRejectedValueOnce(new Error('boom'));
    const { container } = render(<OwnerReportModal {...baseProps} imageRoles={{}} />);
    await waitFor(() => expect(screen.getByText(/⟦Couldn't build the owner report/)).toBeInTheDocument());
    expect(findUntranslated(container, [])).toEqual([]);
    spy.mockRestore();
  });

  it('counts take the French plural forms', async () => {
    await loadLanguage('fr');
    await i18n.changeLanguage('fr');
    attachmentsState.items = [photo('a1')];
    const { rerender } = render(<OwnerReportModal {...baseProps} imageRoles={{ a1: 'before' }} bare />);
    expect(screen.getByText('1 photo avant/après incluse.')).toBeInTheDocument();
    attachmentsState.items = [photo('a1'), photo('a2'), photo('a3')];
    rerender(<OwnerReportModal {...baseProps} imageRoles={{ a1: 'before', a2: 'after', a3: 'after' }} bare />);
    await waitFor(() => expect(screen.getByText('3 photos avant/après incluses.')).toBeInTheDocument());
  });
});
