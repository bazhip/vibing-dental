import { LANGUAGE_NAMES } from '../../i18n/config';
import { sampleOwnerReportSnapshot } from '../../utils/ownerReportSample';
vi.mock('../../utils/radiologyReportAi',()=>({draftRadiologyReport:async()=> '108: 4.5 mm'}));
vi.mock('../../native/aiConsent',()=>({ensureAiConsent:async()=>true}));
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../../i18n/testing/pseudo';
import i18n from '../../i18n';
import { PimsDrafts } from './PimsDrafts';
import type { DraftBackend } from '../../utils/pims/drafts';

beforeEach(async () => { vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true'); await installPseudoLocale(); });
afterEach(async () => { cleanup(); vi.unstubAllEnvs(); await restoreLocale(); });
it('translates missing-storage and unsaved-chart notices', async () => {
  render(<PimsDrafts chartId="chart" backend={null} />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:drafts.open') }));
  await screen.findByRole('alert');
  expect(findUntranslated(document.body)).toEqual([]);
});
it('translates draft composition, review, transfer and source labels', async () => {
  const backend = { context: async () => ({ source: { chart_id: 'chart', practice_id: 'practice', patient_name: 'Milo',
    patient_number: 'P-1', chart_date: '2026-11-16', updated_at: '2026-11-16T12:00:00Z', hash: 'a'.repeat(64), data: {} }, drafts: [] }) } as unknown as DraftBackend;
  render(<PimsDrafts chartId="chart" backend={backend} />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:drafts.open') }));
  await screen.findByLabelText(i18n.t('pims:drafts.body'));
  expect(findUntranslated(document.body, [...Object.values(LANGUAGE_NAMES)])).toEqual([]);
});

it('translates the prepared Instinct destination and explicit confirmation', async () => {
  const source = { chart_id: 'chart', practice_id: 'practice', patient_name: 'Milo', patient_number: 'P-1', chart_date: '2026-11-16',
    updated_at: '2026-11-16T12:00:00Z', hash: 'a'.repeat(64), data: {} };
  const draft = { id: 'draft', chart_id: 'chart', practice_id: 'practice', kind: 'history' as const, language: 'en' as const,
    body: '108: 4.5 mm', source_hash: source.hash, source, version: 1, reviewed_version: 1, reviewed_by: 'vet', reviewed_at: source.updated_at };
  const backend = { context: async () => ({ source, drafts: [draft] }) } as unknown as DraftBackend;
  const transport = { instinctSubmission: async () => ({ state: 'prepared', ticket: 'ticket', patient_id: 'P-1', location_id: '1',
    location_source: 'compatibility_default', origin: 'https://us.instinctvet.com', expires_at: new Date(Date.now() + 60000).toISOString() }) } as unknown as import('../../utils/pims/extensionBridge').PimsTransport;
  render(<PimsDrafts chartId="chart" backend={backend} instinctUpload={{ tabId: 12, transport }} />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:drafts.open') }));
  fireEvent.click(await screen.findByRole('button', { name: i18n.t('pims:drafts.instinct.prepare') }));
  await screen.findByLabelText(i18n.t('pims:drafts.instinct.checked'));
  expect(findUntranslated(document.body, [...Object.values(LANGUAGE_NAMES), 'P-1', '108: 4.5 mm'])).toEqual([]);
});

it.each(['filled', 'blocked', 'unknown'] as const)('translates radiology target review and %s outcomes', async state => {
  const source = { chart_id: 'chart', practice_id: 'practice', patient_name: 'Milo', patient_number: 'P-1', chart_date: '2026-11-16',
    updated_at: '2026-11-16T12:00:00Z', hash: 'a'.repeat(64), data: {} };
  const draft = { id: 'draft', chart_id: 'chart', practice_id: 'practice', kind: 'radiology' as const, language: 'en' as const,
    body: '108: 4.5 mm', source_hash: source.hash, source, version: 1, reviewed_version: 1, reviewed_by: 'vet', reviewed_at: source.updated_at };
  const backend = { context: async () => ({ source, drafts: [draft] }), export: async () => draft } as unknown as DraftBackend;
  const transport = { radiologyAutofill: async (request: { operation: string }) => request.operation === 'list'
    ? { state: 'targets', targets: [{ tabId: 21, provider: 'radimal', origin: 'https://app.radimal.ai', title: 'Milo' }] }
    : request.operation === 'prepare' ? { state: 'prepared', ticket: 'ticket', provider: 'radimal', origin: 'https://app.radimal.ai', title: 'Milo',
      existing_characters: 0, expires_at: new Date(Date.now() + 60000).toISOString() } : { state } } as unknown as import('../../utils/pims/extensionBridge').PimsTransport;
  render(<PimsDrafts chartId="chart" backend={backend} radiologyTransport={transport} />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:drafts.open') }));
  fireEvent.click(await screen.findByRole('button', { name: i18n.t('pims:drafts.radiologyAutofill.review') }));
  fireEvent.change(await screen.findByLabelText(i18n.t('pims:drafts.radiologyAutofill.destination')), { target: { value: '21' } });
  fireEvent.click(await screen.findByLabelText(i18n.t('pims:drafts.radiologyAutofill.checked')));
  expect(findUntranslated(document.body, [...Object.values(LANGUAGE_NAMES), 'Milo', 'P-1', '108: 4.5 mm'])).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:drafts.radiologyAutofill.fill') }));
  await screen.findByText(i18n.t(`pims:drafts.radiologyAutofill.${state}`));
  expect(findUntranslated(document.body, [...Object.values(LANGUAGE_NAMES), 'Milo', 'P-1', '108: 4.5 mm'])).toEqual([]);
});

it('translates radiology AI generation and its unapplied preview',async()=>{
 const data=sampleOwnerReportSnapshot();data.patientInfo.radiographicFindings='108: 4.5 mm';
 const source={chart_id:'chart',practice_id:'practice',patient_name:data.patientInfo.patientName,patient_number:data.patientInfo.patientNumber,chart_date:'2026-11-17',updated_at:'2026-11-17T12:00:00Z',hash:'a'.repeat(64),data};
 const backend={context:async()=>({source,drafts:[]})} as unknown as DraftBackend;
 render(<PimsDrafts chartId="chart" backend={backend} aiEnabled/>);
 fireEvent.click(screen.getByRole('button',{name:i18n.t('pims:drafts.open')}));
 fireEvent.change(await screen.findByLabelText(i18n.t('pims:drafts.kind')),{target:{value:'radiology'}});
 fireEvent.click(screen.getByRole('button',{name:i18n.t('pims:drafts.aiRadiology.generate')}));
 await screen.findByLabelText(i18n.t('pims:drafts.aiRadiology.preview'));
 expect(findUntranslated(document.body,[...Object.values(LANGUAGE_NAMES),'108: 4.5 mm'])).toEqual([]);
});
