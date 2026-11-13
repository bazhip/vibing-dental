import { useTranslation } from 'react-i18next';
import { NavBar } from '../NavBar';
import { List, ListRow, ListSection } from '../List';
import { useAppShell } from '../AppShell';
import { useAppLibrary } from '../appData';
import { useChartRows } from './PatientsScreen';


const CHEVRON = 'chevron' as const;
/**
 * Rechecks tab — PLACEHOLDER (Task 5 replaces this file). Lists visits
 * whose recheck is due (today or earlier), as ChartLibrary's Due filter.
 */
export function RechecksScreen() {
  const { t } = useTranslation();
  const library = useAppLibrary();
  const shell = useAppShell();
  const rows = useChartRows(library ? () => library.listCharts({ dueOnly: true, sortKey: 'recall', sortDir: 'asc', limit: 500 }) : null);

  return (
    <>
      <NavBar title={t('ios.tabs.rechecks')} largeTitle />
      <List>
        {!library ? (
          <p className="ios-empty">{t('ios.patients.signIn')}</p>
        ) : rows === 'error' ? (
          <p className="ios-empty">{t('ios.patients.loadFailed')}</p>
        ) : rows && rows.length === 0 ? (
          <p className="ios-empty">{t('ios.rechecks.empty')}</p>
        ) : rows ? (
          <ListSection>
            {rows.map((c) => (
              <ListRow
                key={c.id}
                title={c.patient_name || t('ios.patients.unnamed')}
                value={c.recall_date}
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
