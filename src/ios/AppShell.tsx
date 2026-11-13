import React from 'react';
import { useTranslation } from 'react-i18next';
import { hapticSelection } from '../native/haptics';
import { Icon, type IconName } from './icons';
import { Stack, useStack } from './Stack';
import { TabBar } from './TabBar';
import { ScrollContainerContext } from './scrollContainer';

/**
 * The app's top level: four tabs (Chart, Patients, Rechecks, Settings).
 *
 * iPhone, and iPad in portrait / Slide Over: a floating tab bar at the
 * bottom. iPad regular width (REGULAR_WIDTH_QUERY): a collapsible sidebar
 * listing the four destinations, with the chart sections under Chart.
 *
 * Every tab body is the root of its own <Stack> and stays mounted the whole
 * time. Hidden tabs get `hidden` + `inert` (CSS keeps them laid out with
 * visibility:hidden, so WebKit keeps their scroll positions), which keeps
 * form state, pushed screens and scroll offsets when switching tabs.
 * Tapping the selected tab again pops it to its root (or scrolls the root
 * to the top when already there).
 *
 * The tab bar, the sidebar and the sidebar button are outside every Stack
 * (kit rule: fixed UI never lives inside a stack layer).
 *
 * Screens reach the shell through useAppShell(): `openChart(id)` opens a
 * saved chart (through `onOpenChart`) and lands on the Chart tab.
 */

export type AppTab = 'chart' | 'patients' | 'rechecks' | 'settings';
export const APP_TABS: readonly AppTab[] = ['chart', 'patients', 'rechecks', 'settings'];

const TAB_ICONS: Record<AppTab, IconName> = {
  chart: 'doc-text',
  patients: 'person-2',
  rechecks: 'calendar-badge-clock',
  settings: 'gear',
};
const SIDEBAR_ICON: IconName = 'sidebar-left';

/** iPad regular width: ≥1024pt, or ≥768pt in landscape. The height floor
 *  keeps phones in landscape (≤ 440pt tall) on the tab bar. */
export const REGULAR_WIDTH_QUERY =
  '(min-width: 1024px) and (min-height: 600px), (min-width: 768px) and (min-height: 600px) and (orientation: landscape)';

export function useRegularWidth(): boolean {
  const query = React.useMemo(
    () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(REGULAR_WIDTH_QUERY) : null),
    []
  );
  const [regular, setRegular] = React.useState(() => !!query?.matches);
  React.useEffect(() => {
    if (!query) return undefined;
    const onChange = () => setRegular(query.matches);
    onChange();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    query.addListener?.(onChange);
    return () => query.removeListener?.(onChange);
  }, [query]);
  return regular;
}

export interface AppShellApi {
  activeTab: AppTab;
  /** Show a tab (its stack keeps whatever was pushed on it). */
  goToTab(tab: AppTab): void;
  /**
   * Land on the Chart tab, at its root. With an id, first opens that saved
   * chart through the shell's `onOpenChart` (which asks about unsaved
   * changes); resolves false and stays put if that was cancelled.
   */
  openChart(id?: string): Promise<boolean>;
  /** 'sidebar' on iPad regular width, else 'tabs'. */
  layout: 'tabs' | 'sidebar';
}

const AppShellContext = React.createContext<AppShellApi | null>(null);

export function useAppShell(): AppShellApi {
  const api = React.useContext(AppShellContext);
  if (!api) throw new Error('useAppShell() must be used inside <AppShell>');
  return api;
}

export interface ChartSectionLink {
  id: string;
  label: string;
}

export interface AppShellProps {
  chart: React.ReactNode;
  patients: React.ReactNode;
  rechecks: React.ReactNode;
  settings: React.ReactNode;
  activeTab: AppTab;
  onTabChange(tab: AppTab): void;
  /** Opens a saved chart by id; return false when the user cancelled. */
  onOpenChart?(id: string): Promise<boolean | void> | boolean | void;
  /** Chart sections, listed under Chart in the iPad sidebar. */
  chartSections?: ChartSectionLink[];
  activeChartSection?: string;
  onChartSection?(id: string): void;
  /** Red badge counts per tab (e.g. rechecks due). */
  badges?: Partial<Record<AppTab, number>>;
}

/** What each tab's stack reports up to the shell. */
interface TabHandle {
  popToRoot(): void;
  depth: number;
  /** Scroll the tab's root screen to the top (smoothly by default). */
  scrollToTop(smooth?: boolean): void;
}

/** Rendered inside each tab's Stack root: hands the stack's API to the shell. */
function TabBridge({ tab, register }: { tab: AppTab; register(tab: AppTab, h: TabHandle | null): void }) {
  const { popToRoot, depth } = useStack();
  const scrollRef = React.useContext(ScrollContainerContext);
  React.useEffect(() => {
    register(tab, {
      popToRoot,
      depth,
      scrollToTop: (smooth = true) => {
        const el = scrollRef?.current;
        if (!el) return;
        if (typeof el.scrollTo === 'function') el.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
        else el.scrollTop = 0;
      },
    });
  }, [tab, register, popToRoot, depth, scrollRef]);
  React.useEffect(() => () => register(tab, null), [tab, register]);
  return null;
}

export function AppShell({
  chart,
  patients,
  rechecks,
  settings,
  activeTab,
  onTabChange,
  onOpenChart,
  chartSections = [],
  activeChartSection,
  onChartSection,
  badges,
}: AppShellProps) {
  const { t } = useTranslation();
  const regular = useRegularWidth();
  const [collapsed, setCollapsed] = React.useState(false);
  const sidebar = regular;
  const sidebarShown = sidebar && !collapsed;

  const handles = React.useRef<Partial<Record<AppTab, TabHandle>>>({});
  const [depths, setDepths] = React.useState<Partial<Record<AppTab, number>>>({});
  const register = React.useCallback((tab: AppTab, h: TabHandle | null) => {
    if (h) handles.current[tab] = h;
    else delete handles.current[tab];
    const depth = h?.depth ?? 0;
    setDepths((d) => (d[tab] === depth ? d : { ...d, [tab]: depth }));
  }, []);

  const labels: Record<AppTab, string> = {
    chart: t('ios.tabs.chart'),
    patients: t('ios.tabs.patients'),
    rechecks: t('ios.tabs.rechecks'),
    settings: t('ios.tabs.settings'),
  };

  const activeRef = React.useRef(activeTab);
  activeRef.current = activeTab;
  const onTabChangeRef = React.useRef(onTabChange);
  onTabChangeRef.current = onTabChange;
  const onOpenChartRef = React.useRef(onOpenChart);
  onOpenChartRef.current = onOpenChart;

  /** Tab bar / sidebar tap: switch, or reset the tab when it's already selected. */
  const selectTab = React.useCallback((tab: AppTab) => {
    if (tab === activeRef.current) {
      const h = handles.current[tab];
      if (h && h.depth > 0) h.popToRoot();
      else h?.scrollToTop();
      return;
    }
    onTabChangeRef.current(tab);
  }, []);

  const goToTab = React.useCallback((tab: AppTab) => {
    if (tab !== activeRef.current) onTabChangeRef.current(tab);
  }, []);

  const openChart = React.useCallback(
    async (id?: string) => {
      if (id !== undefined && onOpenChartRef.current) {
        const ok = await onOpenChartRef.current(id);
        if (ok === false) return false;
      }
      const h = handles.current.chart;
      if (h && h.depth > 0) h.popToRoot();
      goToTab('chart');
      return true;
    },
    [goToTab]
  );

  const api = React.useMemo<AppShellApi>(
    () => ({ activeTab, goToTab, openChart, layout: sidebar ? 'sidebar' : 'tabs' }),
    [activeTab, goToTab, openChart, sidebar]
  );

  const bodies: Record<AppTab, React.ReactNode> = { chart, patients, rechecks, settings };

  /** Sidebar chart section: Chart tab, that section, from its top. */
  const chooseSection = (id: string) => {
    const same = activeRef.current === 'chart' && id === activeChartSection;
    if (!same) hapticSelection();
    const h = handles.current.chart;
    if (h && h.depth > 0) h.popToRoot();
    goToTab('chart');
    onChartSection?.(id);
    h?.scrollToTop(same);
  };

  const shellClass = [
    'ios-appshell',
    sidebar ? 'ios-appshell--sidebar' : 'ios-appshell--tabbar',
    sidebar && collapsed ? 'ios-appshell--sidebar-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <AppShellContext.Provider value={api}>
      <div className={shellClass}>
        {sidebar && (
          <aside
            className="ios-appshell__sidebar"
            aria-hidden={sidebarShown ? undefined : true}
            inert={sidebarShown ? undefined : true}
          >
            <div className="ios-appshell__sidebar-head">
              <button
                type="button"
                className="ios-glass-button ios-glass-button--icon ios-appshell__sidebar-toggle"
                aria-label={t('ios.shell.hideSidebar')}
                aria-expanded={true}
                onClick={() => setCollapsed(true)}
              >
                <Icon name={SIDEBAR_ICON} size={22} />
              </button>
            </div>
            <nav className="ios-appshell__sidebar-nav" aria-label={t('ios.shell.appName')}>
              {APP_TABS.map((tab) => {
                const selected = tab === activeTab;
                const badge = badges?.[tab];
                return (
                  <React.Fragment key={tab}>
                    <button
                      type="button"
                      className={`ios-appshell__item${selected ? ' ios-appshell__item--selected' : ''}`}
                      aria-current={selected ? 'page' : undefined}
                      onClick={() => {
                        if (!selected) hapticSelection();
                        selectTab(tab);
                      }}
                    >
                      <Icon name={TAB_ICONS[tab]} size={22} filled={selected} />
                      <span className="ios-appshell__item-label">{labels[tab]}</span>
                      {badge && badge > 0 ? (
                        <span className="ios-appshell__item-badge">{badge > 99 ? '99+' : badge}</span>
                      ) : null}
                    </button>
                    {tab === 'chart' && chartSections.length > 0 && (
                      <div className="ios-appshell__subitems" role="group" aria-label={t('ios.shell.chartSections')}>
                        {chartSections.map((s) => {
                          const current = activeTab === 'chart' && s.id === activeChartSection;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              className={`ios-appshell__subitem${current ? ' ios-appshell__subitem--selected' : ''}`}
                              aria-current={current ? 'location' : undefined}
                              onClick={() => chooseSection(s.id)}
                            >
                              {s.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </nav>
          </aside>
        )}
        <div className="ios-appshell__content">
          {APP_TABS.map((tab) => {
            const shown = tab === activeTab;
            return (
              <div
                key={tab}
                className="ios-appshell__panel"
                data-app-tab={tab}
                hidden={shown ? undefined : true}
                inert={shown ? undefined : true}
              >
                <Stack
                  rootTitle={labels[tab]}
                  root={
                    <>
                      <TabBridge tab={tab} register={register} />
                      {bodies[tab]}
                    </>
                  }
                />
              </div>
            );
          })}
        </div>
        {/* Reopen the collapsed sidebar: top-leading, where the root
            screens' bars leave room (pushed screens show Back there). */}
        {sidebar && collapsed && !(depths[activeTab] ?? 0) && (
          <button
            type="button"
            className="ios-glass-button ios-glass-button--icon ios-appshell__sidebar-reopen"
            aria-label={t('ios.shell.showSidebar')}
            aria-expanded={false}
            onClick={() => setCollapsed(false)}
          >
            <Icon name={SIDEBAR_ICON} size={22} />
          </button>
        )}
        {!sidebar && (
          <TabBar
            label={t('ios.shell.appName')}
            active={activeTab}
            onChange={(id) => selectTab(id as AppTab)}
            tabs={APP_TABS.map((tab) => ({ id: tab, label: labels[tab], icon: TAB_ICONS[tab], badge: badges?.[tab] }))}
          />
        )}
      </div>
    </AppShellContext.Provider>
  );
}
