import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PimsExam, type PimsExamProps } from './PimsExam';
import i18n from '../../i18n';
import type { InspectResult } from '../../extension/protocol';
import type { PhysicalExamCode, PhysicalExamResult } from '../../extension/pims/types';
import type { PimsTransport } from '../../utils/pims/extensionBridge';

const auth = vi.hoisted(() => ({ available: true, event: (_event: string, _session: { user: { id: string } } | null) => {}, unsubscribe: vi.fn() }));
vi.mock('../../utils/supabaseClient', () => ({ supabase: { get auth() { return auth.available ? { onAuthStateChange: (callback: typeof auth.event) => {
  auth.event = callback;
  callback('INITIAL_SESSION', { user: { id: 'user' } });
  return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
} } : undefined; } } }));

type ExamKey = Exclude<keyof typeof import('../../locales/en/pims.json')['exam'], 'errors'> | `errors.${PhysicalExamCode}`;
const label = (key: ExamKey) => i18n.t(`pims:exam.${key}`);
const recordId = '12345678-1234-1234-1234-123456789abc';
const url = `https://app.shepherd.vet/soap/${recordId}/objective`;
const inspection: InspectResult = { tab: { id: 7, title: 'Shepherd' }, candidates: 1, fields: [],
  status: { provider: 'shepherd', state: 'locked', patientName: null, patientNumber: null, consult: { recordId, viewId: `${url}|` } } };
const prepared: Extract<PhysicalExamResult, { state: 'prepared' }> = { ok: true, state: 'prepared', pageId: 'page', ticket: 'ticket', doctor: 'Dr Rivera', templates: [{ id: 'dental', label: 'Dental' }, { id: 'general', label: 'General' }] };
const opened = { ok: true, state: 'opened', recordId, examId: 'aaaaaaaa-1234-1234-1234-123456789abc' } as const;
function fixture(options: { ping?: PimsTransport['ping']; inspection?: InspectResult; disabled?: boolean } = {}) {
  const inspect = vi.fn(async () => inspection);
  const physicalExam = vi.fn<NonNullable<PimsTransport['physicalExam']>>(async (_tabId, request) => request.operation === 'inspect' ? { ok: true, state: 'available', pageId: 'page' } : request.operation === 'prepare' ? prepared : opened);
  const ping = options.ping ?? vi.fn(async () => ({ version: '1', protocol: 1, capabilities: ['inspect', 'send', 'diagnose', 'physicalExam'] }));
  const transport = { ping, inspect, physicalExam } as unknown as PimsTransport;
  const props: PimsExamProps = { userId: 'user', chartKey: 'chart', inspection: options.inspection ?? inspection, disabled: options.disabled, transport, onOpened: vi.fn(), onBusyChange: vi.fn() };
  const view = render(<PimsExam {...props} />);
  const expand = async () => {
    fireEvent.click(await screen.findByRole('button', { name: label('setup') }));
    await screen.findByLabelText(label('template'));
  };
  return { props, view, physicalExam, inspect, transport, expand };
}
afterEach(() => { cleanup(); auth.available = true; });

describe('PimsExam', () => {
  it('tolerates Supabase mocks without auth and never pings unauthenticated', () => {
    auth.available = false;
    const state = fixture();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(state.transport.ping).not.toHaveBeenCalled();
  });
  it.each([null, { version: 'old', protocol: 1, capabilities: ['inspect', 'send'] }])('hides setup for unavailable or old extensions: %j', async reply => {
    const ping = vi.fn(async () => reply) as PimsTransport['ping'];
    const state = fixture({ ping });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await waitFor(() => expect(ping).toHaveBeenCalledOnce());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(state.physicalExam).not.toHaveBeenCalled();
    expect(state.inspect).not.toHaveBeenCalled();
  });
  it.each([false, true])('retries delayed capability after same-user refresh and respects sign-out: %s', async signOut => {
    const replies: ((value: Awaited<ReturnType<PimsTransport['ping']>>) => void)[] = [];
    const ping = vi.fn(() => new Promise<Awaited<ReturnType<PimsTransport['ping']>>>(resolve => { replies.push(resolve); }));
    const state = fixture({ ping });
    await waitFor(() => expect(ping).toHaveBeenCalledTimes(1));
    act(() => auth.event('TOKEN_REFRESHED', { user: { id: 'user' } }));
    await waitFor(() => expect(ping).toHaveBeenCalledTimes(2));
    const supported = { version: '1', protocol: 1, capabilities: ['physicalExam'] };
    await act(async () => replies[0](supported));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    if (signOut) act(() => auth.event('SIGNED_OUT', null));
    await act(async () => replies[1](supported));
    if (signOut) expect(screen.queryByRole('button')).not.toBeInTheDocument();
    else expect(await screen.findByRole('button', { name: label('setup') })).toBeInTheDocument();
    expect(ping).toHaveBeenCalledTimes(2);
    expect(state.inspect).not.toHaveBeenCalled();
    expect(state.physicalExam).not.toHaveBeenCalled();
  });
  it.each(['user', 'chart', 'provider', 'transport', 'unmount'])('ignores a stale passive capability response after %s changes', async change => {
    let resolve!: (value: Awaited<ReturnType<PimsTransport['ping']>>) => void;
    const ping = vi.fn(() => new Promise<Awaited<ReturnType<PimsTransport['ping']>>>(done => { resolve ??= done; }));
    const state = fixture({ ping });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await waitFor(() => expect(resolve).toBeDefined());
    if (change === 'unmount') state.view.unmount();
    else state.view.rerender(<PimsExam {...state.props} userId={change === 'user' ? null : 'user'} chartKey={change === 'chart' ? 'other' : 'chart'}
      transport={change === 'transport' ? { ...state.transport, ping: async () => null } : state.transport}
      inspection={change === 'provider' ? { ...inspection, status: { ...inspection.status!, provider: 'instinct' } } : inspection} />);
    await act(async () => resolve({ version: '1', protocol: 1, capabilities: ['physicalExam'] }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(ping).toHaveBeenCalledTimes(change === 'chart' ? 2 : 1);
    expect(state.physicalExam).not.toHaveBeenCalled();
  });
  it('checks capabilities after an initially disabled send finishes', async () => {
    const state = fixture({ disabled: true });
    await act(async () => undefined);
    await act(async () => state.view.rerender(<PimsExam {...state.props} disabled={false} />));
    expect(await screen.findByRole('button', { name: label('setup') })).toBeInTheDocument();
    expect(state.physicalExam).not.toHaveBeenCalled();
  });
  it('rechecks capability on explicit preparation and never sends exam requests to a downgraded extension', async () => {
    const ping = vi.fn<PimsTransport['ping']>().mockResolvedValueOnce({ version: '1', protocol: 1, capabilities: ['physicalExam'] })
      .mockResolvedValue({ version: 'old', protocol: 1, capabilities: ['inspect'] });
    const state = fixture({ ping });
    fireEvent.click(await screen.findByRole('button', { name: label('setup') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(label('errors.unavailable'));
    expect(state.physicalExam).not.toHaveBeenCalled();
  });
  it.each(['instinct', 'ezyvet'] as const)('does not ping %s', provider => {
    const state = fixture({ inspection: { ...inspection, status: { ...inspection.status!, provider } } });
    expect(state.transport.ping).not.toHaveBeenCalled();
  });
  it('uses observed app authentication without requiring parent userId plumbing', async () => {
    const state = fixture();
    state.view.rerender(<PimsExam {...state.props} userId={undefined} disabled={false} />);
    await state.expand();
    act(() => auth.event('SIGNED_OUT', null));
    expect(screen.queryByLabelText(label('template'))).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('discards pending inspection synchronously on sign-out or account switch', async () => {
    const state = fixture();
    let resolve!: (value: InspectResult) => void;
    state.inspect.mockImplementation(() => new Promise(done => { resolve = done; }));
    fireEvent.click(await screen.findByRole('button', { name: label('setup') }));
    await waitFor(() => expect(resolve).toBeDefined());
    act(() => auth.event('SIGNED_IN', { user: { id: 'other-user' } }));
    resolve(inspection);
    await waitFor(() => expect(state.props.onBusyChange).toHaveBeenLastCalledWith(false));
    expect(state.physicalExam).not.toHaveBeenCalled();
  });
  it('invalidates preparation when sending disables setup, without cancelling its own busy callback', async () => {
    const state = fixture(); await state.expand();
    state.view.rerender(<PimsExam {...state.props} disabled />);
    await act(async () => state.view.rerender(<PimsExam {...state.props} disabled={false} />));
    expect(screen.queryByLabelText(label('template'))).not.toBeInTheDocument();
    expect(state.props.onBusyChange).toHaveBeenNthCalledWith(1, true);
    expect(state.props.onBusyChange).toHaveBeenNthCalledWith(2, false);
  });
  it.each(['user', 'chart', 'provider', 'unmount'])('does not refresh or write after %s changes during opening', async change => {
    const state = fixture(); await state.expand();
    let resolve!: (value: PhysicalExamResult) => void;
    state.physicalExam.mockImplementation(() => new Promise(done => { resolve = done; }));
    fireEvent.change(screen.getByLabelText(label('template')), { target: { value: 'dental' } });
    fireEvent.click(screen.getByRole('button', { name: label('open') }));
    await waitFor(() => expect(resolve).toBeDefined());
    if (change === 'unmount') state.view.unmount();
    else state.view.rerender(<PimsExam {...state.props} userId={change === 'user' ? null : 'user'} chartKey={change === 'chart' ? 'another' : 'chart'}
      inspection={change === 'provider' ? { ...inspection, status: { ...inspection.status!, provider: 'instinct' } } : inspection} />);
    resolve(opened);
    await waitFor(() => expect(state.props.onBusyChange).toHaveBeenLastCalledWith(false));
    expect(state.props.onOpened).not.toHaveBeenCalled();
  });
  it('does nothing by default and requires an explicit template before opening', async () => {
    const state = fixture();
    expect(state.physicalExam).not.toHaveBeenCalled();
    expect(state.inspect).not.toHaveBeenCalled();
    await state.expand();
    expect(screen.getByLabelText(label('template'))).toHaveValue('');
    expect(screen.getByRole('button', { name: label('open') })).toBeDisabled();
    expect(screen.getByText('Dr Rivera')).toBeInTheDocument();
    expect(state.physicalExam.mock.calls.map(([, request]) => request.operation)).toEqual(['inspect', 'prepare']);
    fireEvent.change(screen.getByLabelText(label('template')), { target: { value: 'dental' } });
    const button = screen.getByRole('button', { name: label('open') });
    fireEvent.click(button); fireEvent.click(button);
    await screen.findByText(label('opened'));
    expect(state.physicalExam.mock.calls.filter(([, request]) => request.operation === 'open')).toHaveLength(1);
    expect(state.physicalExam).toHaveBeenLastCalledWith(7, { operation: 'open', target: { provider: 'shepherd', consult: inspection.status!.consult }, pageId: 'page', ticket: 'ticket', templateId: 'dental' });
    expect(state.props.onOpened).toHaveBeenCalledOnce();
  });
  it.each(['physical_exam_template_not_found', 'supervising_doctor_not_set', 'physical_exam_outcome_unknown'] as const)('localizes %s and locks uncertain opening', async code => {
    const state = fixture();
    state.physicalExam.mockImplementation(async (_tabId, request) => request.operation === 'inspect' ? { ok: true, state: 'available', pageId: 'page' } : { ok: false, code });
    fireEvent.click(await screen.findByRole('button', { name: label('setup') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(label(`errors.${code}`));
    expect(state.props.onOpened).not.toHaveBeenCalled();
    if (code === 'physical_exam_outcome_unknown') expect(screen.queryByRole('button', { name: label('setup') })).not.toBeInTheDocument();
  });
  it.each(['user', 'chart', 'provider', 'unmount'])('ignores pending preparation after %s changes', async change => {
    const state = fixture();
    let resolve!: (value: PhysicalExamResult) => void;
    state.physicalExam.mockImplementation(async (_tabId, request) => request.operation === 'inspect'
      ? { ok: true, state: 'available', pageId: 'page' } : new Promise<PhysicalExamResult>(done => { resolve = done; }));
    fireEvent.click(await screen.findByRole('button', { name: label('setup') }));
    await waitFor(() => expect(resolve).toBeDefined());
    if (change === 'unmount') state.view.unmount();
    else state.view.rerender(<PimsExam {...state.props} userId={change === 'user' ? null : 'user'} chartKey={change === 'chart' ? 'another' : 'chart'}
      inspection={change === 'provider' ? { ...inspection, status: { ...inspection.status!, provider: 'instinct' } } : inspection} />);
    resolve(prepared);
    await waitFor(() => expect(state.props.onBusyChange).toHaveBeenLastCalledWith(false));
    expect(screen.queryByLabelText(label('template'))).not.toBeInTheDocument();
    expect(state.physicalExam.mock.calls.some(([, request]) => request.operation === 'open')).toBe(false);
  });
  it('refuses an inspection whose tab or chart changed before opening', async () => {
    const state = fixture(); await state.expand();
    state.inspect.mockResolvedValue({ ...inspection, tab: { id: 8, title: 'Other' } });
    fireEvent.change(screen.getByLabelText(label('template')), { target: { value: 'dental' } });
    fireEvent.click(screen.getByRole('button', { name: label('open') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(label('errors.patient_changed'));
    expect(state.physicalExam.mock.calls.some(([, request]) => request.operation === 'open')).toBe(false);
  });
  it('never offers setup without a signed-in user, on another provider or outside Objective', () => {
    const state = fixture();
    state.view.rerender(<PimsExam {...state.props} userId={null} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    state.view.rerender(<PimsExam {...state.props} inspection={{ ...inspection, status: { ...inspection.status!, provider: 'instinct' } }} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    state.view.rerender(<PimsExam {...state.props} inspection={{ ...inspection, status: { ...inspection.status!, consult: { recordId, viewId: `${url}/physical-exam-entry/edit/id|` } } }} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
