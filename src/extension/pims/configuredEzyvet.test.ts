import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { captureEzyvetAppointments } from './configuredEzyvet';
import type { AdapterContext } from './types';

const tooltip = '<div><label>Patient</label><span class="value">Bella (12345)</span></div><div><label>Owner</label><span class="value">Owner Name</span></div>';
function fixture() {
  document.body.innerHTML = `<div id="rightpane"><div class="dashboard active"><div class="sep"><span>Dr Rivera</span></div>
  <div id="appt55" data-record-id="55" data-appointment="900" data-animal="3" data-start="34200" data-col="1"></div></div></div>
  <div id="calendarSideList"><input name="currentdate" value="2026-11-16"></div>
  <div id="timespanSelector"><div class="active"><span data-text="Day"></span></div></div>`;
  const fetcher = vi.fn(async () => ({ ok: true, text: async () => tooltip }) as Response);
  const context: AdapterContext = { doc: document, url: new URL('https://clinic.ezyvet.com/'), fetch: fetcher,
    localStorage, sessionStorage, wait: async () => undefined };
  return { context, fetcher };
}
beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => vi.restoreAllMocks());
it('captures raw patient/appointment identities and explicit provider-name keys without display payloads', async () => {
  const { context, fetcher } = fixture();
  const result = await captureEzyvetAppointments('2026-11-16', context);
  expect(result).toEqual({ items: [{ appointment_id: '900', patient_id: '3', clinician_id: 'name:Dr Rivera', encounter_id: null,
    starts_at: new Date(2026,10,16,9,30).toISOString(), ends_at: null, status: 'active' }], failures: [] });
  expect(JSON.stringify(result)).not.toContain('Bella');
  expect(JSON.stringify(result)).not.toContain('Owner Name');
  expect(fetcher).toHaveBeenCalledWith('/General/MouseOver', expect.objectContaining({ method: 'POST' }));
});
it.each(['date', 'patient', 'clinician', 'element'])('rejects a %s change while tooltip bytes arrive', async change => {
  const { context, fetcher } = fixture();
  fetcher.mockImplementation(async () => ({ ok: true, text: async () => {
    if (change === 'date') document.querySelector<HTMLInputElement>('input')!.value = '2026-11-17';
    if (change === 'patient') document.querySelector('#appt55')!.setAttribute('data-animal', 'another');
    if (change === 'clinician') document.querySelector('.sep span')!.textContent = 'Dr Changed';
    if (change === 'element') document.querySelector('#appt55')!.outerHTML = document.querySelector('#appt55')!.outerHTML;
    return tooltip;
  } }) as Response);
  await expect(captureEzyvetAppointments('2026-11-16', context)).rejects.toMatchObject({ code: 'identity_changed' });
});
it('reports absent provider identity without inventing an index or an opaque ID', async () => {
  const { context } = fixture(); document.querySelector('.sep span')!.textContent = '';
  expect(await captureEzyvetAppointments('2026-11-16', context)).toEqual({ items: [], failures: [{ appointment_id:'900', code:'identity_missing' }] });
});
it('refuses a non-calendar page without clicking navigation controls', async () => {
  const { context, fetcher } = fixture(); document.querySelector('#rightpane')!.remove();
  await expect(captureEzyvetAppointments('2026-11-16',context)).rejects.toMatchObject({ code:'invalid_capture' });
  expect(fetcher).not.toHaveBeenCalled();
});
it('rejects conflicting duplicate appointment identities across calendar blocks', async () => {
  const { context } = fixture();
  document.querySelector('.dashboard')!.insertAdjacentHTML('beforeend','<div id="appt56" data-record-id="55" data-appointment="900" data-animal="999" data-start="34200" data-col="1"></div>');
  await expect(captureEzyvetAppointments('2026-11-16',context)).rejects.toMatchObject({ code:'invalid_capture' });
});
it('stops subsequent tooltip reads after an observable cookie/session switch', async () => {
  const { context, fetcher } = fixture();
  let cookie = 'session=original';
  vi.spyOn(document,'cookie','get').mockImplementation(() => cookie);
  fetcher.mockImplementation(async () => { cookie = 'session=changed'; return {ok:true,text:async()=>tooltip} as Response; });
  await expect(captureEzyvetAppointments('2026-11-16',context)).rejects.toMatchObject({code:'identity_changed'});
  expect(fetcher).toHaveBeenCalledOnce();
  vi.restoreAllMocks();
});
