import React from 'react';
import { useTranslation } from 'react-i18next';
import { NavBar } from '../NavBar';
import { List, ListRow, ListSection } from '../List';
import { useAppShell } from '../AppShell';
import { useAppLibrary } from '../appData';
import type { CloudChartMeta } from '../../hooks/useCloudSync';


const CHEVRON = 'chevron' as const;
/**
 * Patients tab — PLACEHOLDER (Task 5 replaces this file). Lists the most
 * recently updated visits and opens one in the Chart tab, which exercises
 * the data path (useAppLibrary + useAppShell().openChart).
 */
export function PatientsScreen() {
  const { t } = useTranslation();
  const library = useAppLibrary();
  const shell = useAppShell();
  const rows = useChartRows(library ? () => library.listCharts({ sortKey: 'updated', sortDir: 'desc', limit: 50 }) : null);

  return (
    <>
      <NavBar title={t('ios.tabs.patients')} largeTitle />
      <List>
        {!library ? (
          <p className="ios-empty">{t('ios.patients.signIn')}</p>
        ) : rows === 'error' ? (
          <p className="ios-empty">{t('ios.patients.loadFailed')}</p>
        ) : rows && rows.length === 0 ? (
          <p className="ios-empty">{t('ios.patients.empty')}</p>
        ) : rows ? (
          <ListSection>
            {rows.map((c) => (
              <ListRow
                key={c.id}
                title={c.patient_name || t('ios.patients.unnamed')}
                subtitle={c.chart_date}
                accessory={CHEVRON}
                onClick={() => void shell.openChart(c.id)}
              />
            ))}
          </ListSection>
        ) : null}
      </List>
    </>
  );
}

/** Loads once (and again when the tab's library changes). */
export function useChartRows(load: (() => Promise<{ rows: CloudChartMeta[] }>) | null): CloudChartMeta[] | 'error' | null {
  const [rows, setRows] = React.useState<CloudChartMeta[] | 'error' | null>(null);
  const loadRef = React.useRef(load);
  loadRef.current = load;
  const enabled = !!load;
  React.useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    loadRef.current?.()
      .then((page) => { if (!cancelled) setRows(page.rows); })
      .catch(() => { if (!cancelled) setRows('error'); });
    return () => { cancelled = true; };
  }, [enabled]);
  return rows;
}
