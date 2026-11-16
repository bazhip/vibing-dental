import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { useEzyvetHandover } from './useEzyvetHandover';
import { FROM_EZYVET_KEY, STASHED_PATIENT_KEY, stashPatient } from '../utils/pims/ezyvetHandover';
import type { TakePendingResult } from '../extension/protocol';

const toast = vi.fn();
vi.mock('../components/ui/dialogs', () => ({ toastWhenReady: (...a: unknown[]) => toast(...a) }));

const handover = { userId: 'u1', patientName: 'Bella', patientNumber: '123', ownerName: 'Smith', latestChartId: null };
const patient = { patientName: 'Bella', patientNumber: '123', ownerName: 'Smith' };

function setup(over: Partial<Parameters<typeof useEzyvetHandover>[0]> = {}) {
  const opts = {
    enabled: true,
    getUserId: vi.fn(async () => 'u1' as string | null),
    take: vi.fn(async (): Promise<TakePendingResult | null> => ({ handover })),
    startNewPatient: vi.fn(async () => true),
    startVisitFromChart: vi.fn(async () => true),
    fillPatient: vi.fn(),
    ...over,
  };
  return opts;
}

async function run(opts: Parameters<typeof useEzyvetHandover>[0]) {
  renderHook(() => useEzyvetHandover(opts), { wrapper: StrictMode });
  await act(async () => {});
}

const FILLED = 'Patient details filled in from ezyVet.';
const FAILED = 'Couldn’t get the patient from ezyVet. Fill in the details.';
const OTHER_USER = 'This patient was picked in the extension as another user. Sign in with the same account in both.';
const toastKeys = () => toast.mock.calls.map((c) => c[0]);

beforeEach(() => {
  window.sessionStorage.clear();
  toast.mockReset();
});

describe('useEzyvetHandover', () => {
  it('fills a stashed patient without asking the extension', async () => {
    stashPatient(patient);
    window.sessionStorage.setItem(FROM_EZYVET_KEY, '1');
    const opts = setup();
    await run(opts);
    expect(opts.fillPatient).toHaveBeenCalledTimes(1);
    expect(opts.fillPatient).toHaveBeenCalledWith(patient);
    expect(opts.take).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(STASHED_PATIENT_KEY)).toBeNull();
    expect(toastKeys()).toEqual([FILLED]);
  });

  it('stashes the patient and starts a new chart (once, even under StrictMode)', async () => {
    window.sessionStorage.setItem(FROM_EZYVET_KEY, '1');
    let stashedAtStart: string | null = null;
    const opts = setup({
      startNewPatient: vi.fn(async () => {
        stashedAtStart = window.sessionStorage.getItem(STASHED_PATIENT_KEY);
        return true;
      }),
    });
    await run(opts);
    expect(opts.take).toHaveBeenCalledTimes(1);
    expect(opts.startNewPatient).toHaveBeenCalledTimes(1);
    expect(JSON.parse(stashedAtStart!)).toEqual(patient);
    expect(opts.fillPatient).not.toHaveBeenCalled();
    expect(toastKeys()).toEqual([]);
  });

  it('removes the stash when the vet keeps the unsaved chart', async () => {
    window.sessionStorage.setItem(FROM_EZYVET_KEY, '1');
    const opts = setup({ startNewPatient: vi.fn(async () => false) });
    await run(opts);
    expect(opts.startNewPatient).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(STASHED_PATIENT_KEY)).toBeNull();
    expect(opts.fillPatient).not.toHaveBeenCalled();
    expect(toastKeys()).toEqual([]);
  });

  it('starts a new visit from the latest chart', async () => {
    window.sessionStorage.setItem(FROM_EZYVET_KEY, '1');
    const opts = setup({ take: vi.fn(async () => ({ handover: { ...handover, latestChartId: 'c9' } })) });
    await run(opts);
    expect(opts.startVisitFromChart).toHaveBeenCalledWith('c9');
    expect(opts.startNewPatient).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(STASHED_PATIENT_KEY)).toBeNull();
    expect(toastKeys()).toEqual([FILLED]);
  });

  it('says nothing when the new visit is declined', async () => {
    window.sessionStorage.setItem(FROM_EZYVET_KEY, '1');
    const opts = setup({
      take: vi.fn(async () => ({ handover: { ...handover, latestChartId: 'c9' } })),
      startVisitFromChart: vi.fn(async () => false),
    });
    await run(opts);
    expect(toastKeys()).toEqual([]);
  });

  it('refuses a patient picked as another user', async () => {
    window.sessionStorage.setItem(FROM_EZYVET_KEY, '1');
    const opts = setup({ getUserId: vi.fn(async () => 'someone-else') });
    await run(opts);
    expect(toastKeys()).toEqual([OTHER_USER]);
    expect(opts.startNewPatient).not.toHaveBeenCalled();
    expect(opts.startVisitFromChart).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(STASHED_PATIENT_KEY)).toBeNull();
  });

  it.each([
    ['null', async () => null],
    ['no handover', async () => ({ handover: null })],
    ['a failure', async () => Promise.reject(new TypeError())],
  ])('says it failed on %s', async (_label, take) => {
    window.sessionStorage.setItem(FROM_EZYVET_KEY, '1');
    const opts = setup({ take: vi.fn(take) });
    await run(opts);
    expect(toastKeys()).toEqual([FAILED]);
    expect(opts.startNewPatient).not.toHaveBeenCalled();
  });

  it('does nothing without the flag', async () => {
    const opts = setup();
    await run(opts);
    expect(opts.take).not.toHaveBeenCalled();
    expect(toastKeys()).toEqual([]);
  });

  it('does nothing when disabled, and keeps the flag for later', async () => {
    window.sessionStorage.setItem(FROM_EZYVET_KEY, '1');
    stashPatient(patient);
    const opts = setup({ enabled: false });
    await run(opts);
    expect(opts.take).not.toHaveBeenCalled();
    expect(opts.fillPatient).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(FROM_EZYVET_KEY)).toBe('1');
  });
});
