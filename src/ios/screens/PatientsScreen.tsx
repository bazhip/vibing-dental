import React from 'react';
import { useTranslation } from 'react-i18next';
import { NavBar } from '../NavBar';
import { List, ListRow, ListSection } from '../List';
import { SwipeRow, type SwipeAction } from '../SwipeRow';
import { ContextMenu, MenuPopover, type MenuAnchor, type MenuItem } from '../ContextMenu';
import { SearchField } from '../SearchField';
import { Icon, type IconName } from '../icons';
import { useAppShell } from '../AppShell';
import { useAppLibrary, type AppLibrary } from '../appData';
import { friendlyError, toast } from '../../components/ui/dialogs';
import { useChartLibraryList, type PatientGroup, type SortDir, type SortKey } from '../../components/chartLibraryData';
import {
  RecallLabel,
  confirmClearRecheck,
  formatUpdated,
  historyLabel,
  todayIso,
  useDoctors,
  usePushPatient,
  useTabReload,
} from './patientShared';

/**
 * Patients tab: the saved-chart library (the website's "My charts") as an
 * iOS list. Large title with a search field under it; a filter / sort menu
 * with every option the website has (sort, species, doctor, Due); patients
 * in an inset-grouped list. Tap a patient for their visits (pushed); swipe
 * or long-press for Send reminder / Clear recheck / History. Delete exists
 * only per visit, on the visits screen.
 */

const CHEVRON = 'chevron' as const;
const FILTER_ICON: IconName = 'line-3-horizontal-decrease';
const PLUS_ICON: IconName = 'plus';
const OPEN_ICON: IconName = 'doc-text';
const TINT = 'tint' as const;
const PLAIN = 'default' as const;
const TAB = 'patients' as const;
const REMINDER = 'reminder';

const SORT_LABEL = { patient: 'filter.sortPatient', updated: 'filter.sortUpdated', recall: 'filter.sortRecall' } as const;
const ORDER_LABELS = {
  patient: { asc: 'filter.patientAsc', desc: 'filter.patientDesc' },
  updated: { desc: 'filter.updatedDesc', asc: 'filter.updatedAsc' },
  recall: { asc: 'filter.recallAsc', desc: 'filter.recallDesc' },
} as const;
const SORT_KEYS: SortKey[] = ['patient', 'updated', 'recall'];
const SPECIES = [
  { value: '', label: 'filter.allSpecies' },
  { value: 'canine', label: 'filter.canine' },
  { value: 'feline', label: 'filter.feline' },
] as const;

export function PatientsScreen() {
  const { t } = useTranslation('patients');
  const library = useAppLibrary();
  if (!library) {
    return (
      <>
        <NavBar title={t('title')} largeTitle />
        <List><p className="ios-empty">{t('signIn')}</p></List>
      </>
    );
  }
  return <PatientsList library={library} />;
}

type ListState = ReturnType<typeof useChartLibraryList>;

/** Filter / sort and Add (new patient, import PDF), in the bar. */
function BarItems({ library, list, shown }: { library: AppLibrary; list: ListState; shown: boolean }) {
  const { t } = useTranslation('patients');
  const { members, doctors } = useDoctors(shown);
  const [menu, setMenu] = React.useState<{ kind: 'filter' | 'add'; anchor: MenuAnchor } | null>(null);
  const pdfInput = React.useRef<HTMLInputElement>(null);

  const anchorOf = (e: React.MouseEvent<HTMLElement>): MenuAnchor => {
    const r = e.currentTarget.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };

  const filterItems: MenuItem[] = [
    ...SORT_KEYS.map((key, i) => ({
      label: t(SORT_LABEL[key]),
      section: i === 0 ? t('filter.sortBy') : undefined,
      type: 'radio' as const,
      checked: list.sortKey === key,
      onSelect: () => list.setSortOrder(key, key === list.sortKey ? list.sortDir : key === 'updated' ? 'desc' : 'asc'),
    })),
    ...(Object.keys(ORDER_LABELS[list.sortKey]) as SortDir[]).map((dir, i) => ({
      label: t(ORDER_LABELS[list.sortKey][dir]),
      section: i === 0 ? t('filter.order') : undefined,
      type: 'radio' as const,
      checked: list.sortDir === dir,
      onSelect: () => list.setSortOrder(list.sortKey, dir),
    })),
    ...SPECIES.map((s, i) => ({
      label: t(s.label),
      section: i === 0 ? t('filter.species') : undefined,
      type: 'radio' as const,
      checked: list.speciesFilter === s.value,
      onSelect: () => list.setSpeciesFilter(s.value),
    })),
    ...(doctors.size > 0
      ? [
        { label: t('filter.allDoctors'), section: t('filter.doctor'), type: 'radio' as const, checked: !list.doctorFilter, onSelect: () => list.setDoctorFilter('') },
        ...members.map((m) => ({
          label: m.doctorName.trim() || m.email,
          type: 'radio' as const,
          checked: list.doctorFilter === m.userId,
          onSelect: () => list.setDoctorFilter(m.userId),
        })),
      ]
      : []),
    {
      label: list.dueCount > 0 ? t('filter.dueCount', { count: list.dueCount }) : t('filter.due'),
      section: true,
      checked: list.dueOnly,
      onSelect: () => list.setDueOnly(!list.dueOnly),
    },
  ];
  const addItems: MenuItem[] = [
    { label: t('add.newPatient'), icon: 'person-2', onSelect: () => void library.newPatient() },
    { label: t('add.importPdf'), icon: 'doc-text', onSelect: () => pdfInput.current?.click() },
  ];
  const filtersOn = !!(list.speciesFilter || list.doctorFilter || list.dueOnly);

  return (
    <>
      <button
        type="button"
        className={`ios-glass-button ios-glass-button--icon${filtersOn ? ' ios-glass-button--prominent' : ''}`}
        aria-label={t('filter.button')}
        aria-haspopup="menu"
        aria-expanded={menu?.kind === 'filter'}
        onClick={(e) => setMenu({ kind: 'filter', anchor: anchorOf(e) })}
      >
        <Icon name={FILTER_ICON} />
      </button>
      <button
        type="button"
        className="ios-glass-button ios-glass-button--icon"
        aria-label={t('add.button')}
        aria-haspopup="menu"
        aria-expanded={menu?.kind === 'add'}
        onClick={(e) => setMenu({ kind: 'add', anchor: anchorOf(e) })}
      >
        <Icon name={PLUS_ICON} />
      </button>
      <input
        ref={pdfInput}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void library.loadPdf(file);
          e.target.value = '';
        }}
      />
      {menu && (
        <MenuPopover
          items={menu.kind === 'filter' ? filterItems : addItems}
          anchor={menu.anchor}
          label={menu.kind === 'filter' ? t('filter.button') : t('add.button')}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}

function PatientsList({ library }: { library: AppLibrary }) {
  const { t } = useTranslation('patients');
  const shell = useAppShell();
  const { shown, token } = useTabReload(TAB);
  const pushPatient = usePushPatient(TAB);
  const list = useChartLibraryList({
    listCharts: library.listCharts,
    onDelete: library.deleteChart,
    onClearRecalls: library.clearRecalls,
    enabled: shown,
    reloadToken: token,
    unnamedLabel: t('unnamed'),
  });

  // Failures other than the list itself are toasts (the list stays).
  const { error, setError } = list;
  React.useEffect(() => {
    if (!error || error.kind === 'load') return;
    toast(t(`errors.${error.kind}`, { error: friendlyError(error.cause) }), { kind: 'error' });
    setError(null);
  }, [error, setError, t]);

  const today = todayIso();
  const { groups } = list;

  const actionsFor = (g: PatientGroup) => {
    const reminder = g.ownerEmail && g.reminderChart ? g.reminderChart : null;
    const latest = g.visits[0];
    const out: { key: string; label: string; icon: IconName; run(): void }[] = [];
    if (reminder) out.push({ key: REMINDER, label: t('actions.sendReminder'), icon: 'bell', run: () => library.sendReminder(reminder) });
    if (g.recall) {
      out.push({
        key: 'clear',
        label: t('actions.clearRecheck'),
        icon: 'checkmark-circle',
        run: () => void list.clearRecheck(g, () => confirmClearRecheck(t, g.name)),
      });
    }
    out.push({ key: 'history', label: t('actions.history'), icon: 'clock-arrow-circlepath', run: () => library.openHistory(latest.id, historyLabel(t, g.name, latest)) });
    return out;
  };

  let body: React.ReactNode;
  if (list.error?.kind === 'load') {
    body = (
      <>
        <p className="ios-empty" role="alert">{t('errors.load', { error: friendlyError(list.error.cause) })}</p>
        <ListSection>
          <ListRow title={t('retry')} onClick={() => void list.refresh()} />
        </ListSection>
      </>
    );
  } else if (groups === null) {
    body = <p className="ios-empty">{t('loading')}</p>;
  } else if (groups.length === 0) {
    body = (
      <p className="ios-empty">
        {!list.filtered ? t('empty') : list.query ? t('noMatch.search') : list.dueOnly ? t('noMatch.due') : t('noMatch.filters')}
      </p>
    );
  } else {
    body = (
      <ListSection>
        {groups.map((g) => {
          const actions = actionsFor(g);
          const swipe: SwipeAction[] = actions.map((a) => ({
            label: a.label,
            icon: a.icon,
            tone: a.key === REMINDER ? TINT : PLAIN,
            onAction: a.run,
          }));
          const menu: MenuItem[] = [
            { label: t('actions.open'), icon: OPEN_ICON, onSelect: () => void shell.openChart(g.visits[0].id) },
            ...actions.map((a) => ({ label: a.label, icon: a.icon, onSelect: a.run })),
          ];
          const details = [
            g.number ? t('row.number', { number: g.number }) : '',
            t('row.visits', { count: g.visits.length }),
            t('row.updated', { date: formatUpdated(g.latestUpdated) }),
          ].filter(Boolean).join(' · ');
          return (
            <SwipeRow key={g.key} actions={swipe} label={g.name}>
              <ContextMenu items={menu}>
                <ListRow
                  title={g.name}
                  subtitle={
                    <>
                      <span className="ios-patient__details">{details}</span>
                      {g.recall && <RecallLabel recall={g.recall} today={today} />}
                    </>
                  }
                  accessory={CHEVRON}
                  onClick={() => pushPatient(g, { species: list.speciesFilter || undefined, createdBy: list.doctorFilter || undefined })}
                />
              </ContextMenu>
            </SwipeRow>
          );
        })}
        {list.hasMore && (
          <ListRow title={list.loadingMore ? t('loading') : t('loadMore')} onClick={() => void list.loadMore()} />
        )}
      </ListSection>
    );
  }

  return (
    <>
      <NavBar title={t('title')} largeTitle trailing={<BarItems library={library} list={list} shown={shown} />} />
      <div className="ios-patients__search">
        <SearchField
          value={list.query}
          onChange={list.setQuery}
          placeholder={t('search.placeholder')}
          label={t('search.label')}
          clearLabel={t('search.clear')}
        />
      </div>
      <List className="ios-patients">{body}</List>
    </>
  );
}
