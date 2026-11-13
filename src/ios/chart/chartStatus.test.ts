import { describe, expect, it } from 'vitest';
import i18n from 'i18next';
import { chartStatus, type ChartStatusInput } from './chartStatus';

const t = i18n.getFixedT('en', 'chart');
const base: ChartStatusInput = {
  cloudEnabled: true,
  trial: false,
  status: 'idle',
  saveError: '',
  saveHint: '',
  readOnly: false,
  viewingSavedVisit: false,
  editingSavedVisit: false,
  dirty: false,
  online: true,
  hasName: true,
  awaitingClinical: false,
  lastSavedAt: '',
  visitDate: '2026-03-04',
};
const run = (patch: Partial<ChartStatusInput>) =>
  chartStatus({ ...base, ...patch }, t, { time: () => '9:41 AM', date: () => 'Mar 4, 2026' });

describe('chartStatus (the Chart navigation bar subtitle)', () => {
  it('says what the save is doing, in the same order as the website pill', () => {
    expect(run({ status: 'saving' }).text).toBe('Saving…');
    expect(run({ status: 'error', saveError: 'Network down' })).toMatchObject({ text: 'Not saved', tone: 'error', detail: 'Network down', retry: true });
    expect(run({ saveHint: 'Add a patient name first' })).toMatchObject({ text: 'Not saved', tone: 'error', detail: 'Add a patient name first', retry: false });
    expect(run({ dirty: true, online: false }).text).toBe('Offline — saved on this device');
    expect(run({ dirty: true, hasName: false }).text).toBe('Add a patient name to save');
    expect(run({ awaitingClinical: true })).toMatchObject({ text: 'Saves once you start charting', canSaveNow: true });
    expect(run({ dirty: true }).text).toBe('Unsaved changes');
    expect(run({ lastSavedAt: '2026-03-04T09:41:00Z' }).text).toBe('Saved · 9:41 AM');
    expect(run({}).text).toBe('');
  });

  it('a view-only saved visit reads "View only · <date>"', () => {
    expect(run({ readOnly: true, viewingSavedVisit: true }).text).toBe('View only · Mar 4, 2026');
    expect(run({ readOnly: true }).text).toBe('View only');
  });

  it('editing a saved visit leads with "Editing"', () => {
    expect(run({ editingSavedVisit: true }).text).toBe('Editing');
    expect(run({ editingSavedVisit: true, status: 'saving' }).text).toBe('Editing · Saving…');
  });

  it('trial charts stay on this device; signed out without trial says nothing', () => {
    expect(run({ cloudEnabled: false, trial: true }).text).toBe('On this device only');
    expect(run({ cloudEnabled: false }).text).toBe('');
  });

  it('the live region stays quiet for autosaves (VoiceOver is not interrupted every few seconds)', () => {
    expect(run({ status: 'saving' }).live).toBe('');
    expect(run({ status: 'saved', lastSavedAt: '2026-03-04T09:41:00Z' }).live).toBe('');
    expect(run({ status: 'saving', announceSaved: true }).live).toBe('');
    expect(run({}).live).toBe('');
    // The visual subtitle still says what the save is doing.
    expect(run({ status: 'saving' }).text).toBe('Saving…');
  });

  it('announces "Chart saved" only after an explicit save (Save now, Try again, Done)', () => {
    expect(run({ status: 'saved', announceSaved: true }).live).toBe('Chart saved');
  });

  it('announces failures and going offline', () => {
    expect(run({ status: 'error' }).live).toBe('Chart not saved');
    expect(run({ status: 'error', saveError: 'Quota' }).live).toBe('Quota');
    expect(run({ dirty: true, online: false }).live).toBe('Offline — saved on this device');
    expect(run({ cloudEnabled: false, trial: true }).live).toBe('');
  });
});
