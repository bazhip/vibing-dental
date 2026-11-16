// Reads the day's appointments from ezyVet's Dashboard calendar and the /General/MouseOver tooltip
// endpoint (page script, world MAIN). Patient data stays in memory: failures carry codes and times only.
import * as S from './selectors';

export type Appointment = {
  appointmentId: string;
  start: string;
  patientName: string;
  patientNumber: string;
  ownerName: string;
  vet: string | null;
};
export type AppointmentFailureCode =
  | 'no_data_col'
  | 'no_appointment_id'
  | 'tooltip_empty'
  | 'tooltip_not_parsed'
  | 'tooltip_fetch_failed';
export type AppointmentsResult =
  | { ok: true; appointments: Appointment[]; failures: { code: AppointmentFailureCode; startsAt: string | null }[] }
  | { ok: false; code: 'not_on_calendar' | 'no_dashboard' | 'no_date_input' | 'no_calendar_refresh' };
export type TooltipFetch = (recordClass: 'Appointment' | 'Consult', recordId: string) => Promise<string>;
export type PageDeps = { doc: Document; fetchTooltip: TooltipFetch; wait: (ms: number) => Promise<void> };

const POLL_MS = 100;
const POLL_LIMIT_MS = 5000;
const AFTER_REFRESH_MS = 1500;
const AFTER_DAY_MS = 500;
const CONCURRENCY = 4;

const defaultFetchTooltip: TooltipFetch = async (recordClass, recordId) => {
  const res = await fetch('/General/MouseOver', {
    method: 'POST',
    credentials: 'include',
    headers: { accept: '*/*', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams({ recordClass, recordId }).toString(),
  });
  return res.text();
};

function defaults(deps?: Partial<PageDeps>): PageDeps {
  return {
    doc: deps?.doc ?? document,
    fetchTooltip: deps?.fetchTooltip ?? defaultFetchTooltip,
    wait: deps?.wait ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
  };
}

const PATIENT_RE = /^(.*\S)\s*\(([^()]*)\)\s*$/;

function labelled(root: Document, word: string): string | null {
  for (const label of Array.from(root.querySelectorAll('label'))) {
    if (!(label.textContent ?? '').trim().startsWith(word)) continue;
    const value = label.parentElement?.querySelector('span.value');
    if (value) return (value.textContent ?? '').trim();
  }
  return null;
}

/** Parses tooltip HTML with DOMParser (never inserted into the page). Null when the patient line
 *  is not `Name (Number)`. */
export function parseTooltip(
  html: string,
): { patientName: string; patientNumber: string; ownerName: string; time: string | null } | null {
  if (!html.trim()) return null;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const m = PATIENT_RE.exec(labelled(parsed, 'Patient') ?? '');
  if (!m) return null;
  const patientNumber = m[2].trim();
  if (!patientNumber) return null;
  return {
    patientName: m[1].trim(),
    patientNumber,
    ownerName: labelled(parsed, 'Owner') ?? '',
    time: labelled(parsed, 'Time') || null,
  };
}

async function pollFor<T>(wait: PageDeps['wait'], probe: () => T | null | undefined | false): Promise<T | null> {
  for (let waited = 0; ; waited += POLL_MS) {
    const v = probe();
    if (v) return v;
    if (waited >= POLL_LIMIT_MS) return null;
    await wait(POLL_MS);
  }
}

function timeToSeconds(display: string | null): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec((display ?? '').trim());
  if (!m) return null;
  return ((Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 3600 + Number(m[2]) * 60;
}

function startIso(date: string, seconds: number | null): string {
  const [y, mo, d] = date.split('-').map(Number);
  const midnight = new Date(y, mo - 1, d);
  return new Date(midnight.getTime() + (seconds ?? 0) * 1000).toISOString();
}

type Failure = { code: AppointmentFailureCode; startsAt: string | null };

export async function listAppointments(
  date: string,
  opts: { navigate: boolean },
  partial?: Partial<PageDeps>,
): Promise<AppointmentsResult> {
  const { doc, fetchTooltip, wait } = defaults(partial);
  if (!doc.querySelector(S.DASHBOARD_ACTIVE)) {
    if (!opts.navigate) return { ok: false, code: 'not_on_calendar' };
    const button = doc.querySelector<HTMLElement>(S.DASHBOARD_BUTTON);
    if (!button) return { ok: false, code: 'no_dashboard' };
    button.click();
    if (!(await pollFor(wait, () => doc.querySelector(S.DASHBOARD_ACTIVE)))) return { ok: false, code: 'no_dashboard' };
  }

  const input = doc.querySelector<HTMLInputElement>(S.CALENDAR_DATE_INPUT);
  if (!input) return { ok: false, code: 'no_date_input' };
  if (input.value !== date) {
    const refresh = (doc.defaultView as (Window & { calendarRefresh?: unknown }) | null)?.calendarRefresh;
    if (typeof refresh !== 'function') return { ok: false, code: 'no_calendar_refresh' };
    input.value = date;
    refresh();
    await wait(AFTER_REFRESH_MS);
  }

  if (!doc.querySelector(S.DAY_VIEW_ACTIVE)) {
    const day = doc.querySelector<HTMLElement>(S.DAY_VIEW_BUTTON);
    if (day) {
      day.click();
      await wait(AFTER_DAY_MS);
    }
  }

  await pollFor(wait, () => doc.querySelector(S.APPOINTMENT_BLOCK));
  const columns = Array.from(doc.querySelectorAll(S.CALENDAR_COLUMN_NAMES)).map((e) => (e.textContent ?? '').trim());
  const blocks = Array.from(doc.querySelectorAll<HTMLElement>(S.APPOINTMENT_BLOCK)).filter((b) => {
    const animal = b.getAttribute('data-animal');
    return animal !== null && animal !== '' && animal !== '0';
  });

  const results: ({ appt: Appointment } | { fail: Failure })[] = new Array(blocks.length);
  let next = 0;
  const work = async () => {
    while (next < blocks.length) {
      const i = next++;
      results[i] = await readBlock(blocks[i]);
    }
  };
  const readBlock = async (b: HTMLElement): Promise<{ appt: Appointment } | { fail: Failure }> => {
    const startAttr = b.getAttribute('data-start');
    const seconds = startAttr !== null && startAttr !== '' && !Number.isNaN(Number(startAttr)) ? Number(startAttr) : null;
    const startsAt = seconds === null ? null : startIso(date, seconds);
    const fail = (code: AppointmentFailureCode) => ({ fail: { code, startsAt } });
    const col = Number(b.getAttribute('data-col'));
    if (!b.getAttribute('data-col') || !Number.isInteger(col) || col < 1) return fail('no_data_col');
    const appointmentId = b.getAttribute('data-appointment');
    if (!appointmentId) return fail('no_appointment_id');
    let html: string;
    try {
      html = await fetchTooltip('Appointment', b.getAttribute('data-record-id') ?? '');
    } catch {
      return fail('tooltip_fetch_failed');
    }
    if (!html.trim()) return fail('tooltip_empty');
    const tip = parseTooltip(html);
    if (!tip) return fail('tooltip_not_parsed');
    return {
      appt: {
        appointmentId,
        start: seconds === null ? startIso(date, timeToSeconds(tip.time)) : startIso(date, seconds),
        patientName: tip.patientName,
        patientNumber: tip.patientNumber,
        ownerName: tip.ownerName,
        vet: columns[col - 1] || null,
      },
    };
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, blocks.length) }, work));

  const appointments: Appointment[] = [];
  const failures: Failure[] = [];
  for (const r of results) {
    if ('appt' in r) appointments.push(r.appt);
    else failures.push(r.fail);
  }
  return { ok: true, appointments, failures };
}

export async function consultPatientNumber(recordId: string, partial?: Partial<PageDeps>): Promise<string | null> {
  const { fetchTooltip } = defaults(partial);
  try {
    return parseTooltip(await fetchTooltip('Consult', recordId))?.patientNumber ?? null;
  } catch {
    return null;
  }
}
