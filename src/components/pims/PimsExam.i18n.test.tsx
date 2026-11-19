import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../../i18n/testing/pseudo';
import i18n from '../../i18n';
import { PimsExam } from './PimsExam';
import type { PimsTransport } from '../../utils/pims/extensionBridge';

vi.mock('../../utils/supabaseClient', () => ({ supabase: { auth: { onAuthStateChange: (callback: (event: string, session: { user: { id: string } }) => void) => {
  callback('INITIAL_SESSION', { user: { id: 'user' } });
  return { data: { subscription: { unsubscribe: vi.fn() } } };
} } } }));

beforeEach(installPseudoLocale);
afterEach(async () => { cleanup(); await restoreLocale(); });
it.each(['opened', 'unknown'])('translates the disclosure, template selector, doctor label and %s state', async outcome => {
  const recordId = '12345678-1234-1234-1234-123456789abc';
  const inspection = { tab: { id: 7, title: 'Shepherd' }, candidates: 1, fields: [], status: { provider: 'shepherd' as const, state: 'locked' as const, patientName: null, patientNumber: null,
    consult: { recordId, viewId: `https://app.shepherd.vet/soap/${recordId}/objective|` } } };
  const physicalExam = vi.fn<NonNullable<PimsTransport['physicalExam']>>(async (_tabId, request) => request.operation === 'inspect' ? { ok: true, state: 'available', pageId: 'page' }
    : request.operation === 'prepare' ? { ok: true, state: 'prepared', pageId: 'page', ticket: 'ticket', doctor: 'Dr Rivera', templates: [{ id: 'dental', label: 'Dental' }] }
      : outcome === 'opened' ? { ok: true, state: 'opened', recordId, examId: 'aaaaaaaa-1234-1234-1234-123456789abc' }
        : { ok: false, code: 'physical_exam_outcome_unknown' });
  const transport = { ping: async () => ({ protocol: 1, version: '1', capabilities: ['physicalExam'] }), inspect: async () => inspection, physicalExam } as unknown as PimsTransport;
  render(<PimsExam inspection={inspection} userId="user" chartKey="chart" transport={transport} onOpened={vi.fn()} />);
  const setup = await screen.findByRole('button', { name: i18n.t('pims:exam.setup') });
  expect(findUntranslated(document.body)).toEqual([]);
  fireEvent.click(setup);
  fireEvent.change(await screen.findByLabelText(i18n.t('pims:exam.template')), { target: { value: 'dental' } });
  expect(findUntranslated(document.body, ['Dr Rivera', 'Dental'])).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:exam.open') }));
  if (outcome === 'opened') await screen.findByText(i18n.t('pims:exam.opened'));
  else await screen.findByRole('alert');
  expect(findUntranslated(document.body)).toEqual([]);
});
