/// <reference types="chrome" />
import React from 'react';
import { useTranslation } from 'react-i18next';
import { WEB_APP_ORIGIN, type Handover } from '../protocol';
import type { Appointment } from '../ezyvet/appointments';
import { internalTransport } from './internalTransport';
import { useTodaysAppointments, type TodayRow } from './useTodaysAppointments';

const KNOWN_ERRORS = new Set(['no_dashboard', 'no_date_input', 'no_calendar_refresh']);

function formatTime(iso: string, lng: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(lng, { hour: 'numeric', minute: '2-digit' }).format(d);
  } catch {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
  }
}

/** Today's ezyVet schedule above the charts list, each patient with Open chart, New visit or Start chart. */
export const TodaysPatients: React.FC<{ userId: string }> = ({ userId }) => {
  const { t, i18n } = useTranslation('pims');
  const { state, refresh, navigated } = useTodaysAppointments(userId);
  const [startFailed, setStartFailed] = React.useState(false);

  const start = (appt: Appointment, latestChartId: string | null) => {
    setStartFailed(false);
    const handover: Handover = { userId, patientName: appt.patientName, patientNumber: appt.patientNumber, ownerName: appt.ownerName, latestChartId };
    internalTransport.startChart(handover).then(
      (r) => { if (!r.ok) setStartFailed(true); },
      () => setStartFailed(true),
    );
  };
  const open = (chartId: string) => void chrome.tabs.create({ url: `${WEB_APP_ORIGIN}/#/chart/${chartId}` });

  const row = ({ appt, action }: TodayRow) => (
    <li key={appt.appointmentId} className="sp-chart sp-appt" data-testid="today-row">
      <span className="sp-chart__name">
        <span className="sp-appt__time">{formatTime(appt.start, i18n.language)}</span> {appt.patientName}
      </span>
      <span className="sp-chart__meta">{[appt.ownerName, appt.vet].filter(Boolean).join(' · ')}</span>
      <span className="sp-appt__actions">
        {action.kind === 'open' && (
          <>
            <button type="button" className="sp-secondary" onClick={() => open(action.chart.id)}>{t('panel.today.open')}</button>
            <button type="button" className="sp-link" onClick={() => start(appt, null)}>{t('panel.today.startAnyway')}</button>
          </>
        )}
        {action.kind === 'newVisit' && (
          <button type="button" className="sp-secondary" onClick={() => start(appt, action.latest.id)}>{t('panel.today.newVisit')}</button>
        )}
        {action.kind === 'start' && (
          <button type="button" className="sp-secondary" onClick={() => start(appt, null)}>{t('panel.today.start')}</button>
        )}
      </span>
    </li>
  );

  let body: React.ReactNode;
  switch (state.kind) {
    case 'loading':
      body = <p className="sp-hint" role="status">{t('panel.today.loading')}</p>;
      break;
    case 'noTab':
      body = <p className="sp-hint">{t('panel.today.noTab')}</p>;
      break;
    case 'notOnCalendar':
      body = (
        <>
          <button type="button" className="sp-secondary" onClick={() => refresh(true)}>{t('panel.today.load')}</button>
          <p className="sp-hint">{t('panel.today.loadHint')}</p>
        </>
      );
      break;
    case 'error':
      body = (
        <p className="sp-error" role="alert">
          {KNOWN_ERRORS.has(state.code)
            ? t(`panel.today.errors.${state.code as 'no_dashboard' | 'no_date_input' | 'no_calendar_refresh'}`)
            : t('panel.today.errors.unknown')}
        </p>
      );
      break;
    case 'ready':
      body = (
        <>
          {state.rows.length > 0 && <ul className="sp-charts">{state.rows.map(row)}</ul>}
          {state.rows.length === 0 && state.failed === 0 && <p className="sp-hint">{t('panel.today.empty')}</p>}
          {state.failed > 0 && <p className="sp-hint">{t('panel.today.failed', { count: state.failed })}</p>}
        </>
      );
      break;
  }

  return (
    <section className="sp-today" aria-labelledby="sp-today-title">
      <div className="sp-today__head">
        <h2 className="sp-section" id="sp-today-title">{t('panel.today.title')}</h2>
        <button type="button" className="sp-link" onClick={() => refresh(navigated)}>{t('panel.today.refresh')}</button>
      </div>
      {body}
      {startFailed && <p className="sp-error" role="alert">{t('panel.today.startFailed')}</p>}
    </section>
  );
};
