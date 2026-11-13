import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell, useAppShell, type AppTab, type AppShellHandle, REGULAR_WIDTH_QUERY, DOCKED_SIDEBAR_QUERY } from './AppShell';
import { useStack } from './Stack';
import { Sheet } from './Sheet';

vi.mock('../native/haptics', () => ({ hapticSelection: vi.fn(), hapticTap: vi.fn(), hapticImpact: vi.fn(), hapticSuccess: vi.fn() }));

const realMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

type Width = 'compact' | 'portrait' | 'landscape';
/** compact = iPhone / Slide Over; portrait = iPad portrait (regular, overlay
 *  sidebar); landscape = iPad landscape (regular, docked sidebar). */
function mockWidth(width: Width) {
  const matching = new Set<string>(
    width === 'compact' ? [] : width === 'portrait' ? [REGULAR_WIDTH_QUERY] : [REGULAR_WIDTH_QUERY, DOCKED_SIDEBAR_QUERY]
  );
  window.matchMedia = ((q: string) => ({
    matches: matching.has(q),
    media: q,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function ChartBody() {
  const [text, setText] = React.useState('');
  const { push } = useStack();
  return (
    <div>
      <input aria-label="Chart field" value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={() => push({ id: 'chart-detail', title: 'Detail', render: () => <p>Chart detail screen</p> })}>Push on chart</button>
    </div>
  );
}

function PatientsBody({ openId }: { openId?: string }) {
  const { push } = useStack();
  const shell = useAppShell();
  return (
    <div>
      <p>Patients root</p>
      <button onClick={() => push({ id: 'visits', title: 'Visits', render: () => <p>Visits screen</p> })}>Open visits</button>
      <button onClick={() => void shell.openChart(openId)}>Open chart</button>
    </div>
  );
}

function Harness({
  initial = 'chart',
  onOpenChart,
  onChartSection,
  onTabChange,
  controllerRef,
}: {
  controllerRef?: React.Ref<AppShellHandle>;
  initial?: AppTab;
  onOpenChart?: (id: string) => Promise<boolean | void> | boolean | void;
  onChartSection?: (id: string) => void;
  onTabChange?: (tab: AppTab) => void;
}) {
  const [tab, setTab] = React.useState<AppTab>(initial);
  return (
    <AppShell
      activeTab={tab}
      onTabChange={(next) => {
        onTabChange?.(next);
        setTab(next);
      }}
      onOpenChart={onOpenChart}
      controllerRef={controllerRef}
      chartSections={[
        { id: 'patient', label: 'Patient' },
        { id: 'charting', label: 'Charting' },
      ]}
      activeChartSection="patient"
      onChartSection={onChartSection}
      chart={<ChartBody />}
      patients={<PatientsBody openId="c-42" />}
      rechecks={<p>Rechecks root</p>}
      settings={<p>Settings root</p>}
    />
  );
}

const panel = (tab: AppTab) => document.querySelector<HTMLElement>(`[data-app-tab="${tab}"]`)!;

describe('AppShell (iPhone)', () => {
  it('renders a tab bar with the four tabs and no sidebar', () => {
    mockWidth('compact');
    render(<Harness />);
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Chart', 'Patients', 'Rechecks', 'Settings']);
    expect(screen.getByRole('tab', { name: 'Chart' })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('.ios-appshell__sidebar')).toBeNull();
  });

  it('keeps every tab mounted when switching, so state and pushed screens survive', async () => {
    mockWidth('compact');
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Chart field'), { target: { value: 'Rex' } });

    fireEvent.click(screen.getByRole('tab', { name: 'Patients' }));
    expect(panel('chart')).toHaveAttribute('hidden');
    expect(panel('chart')).toHaveAttribute('inert');
    expect(panel('patients')).not.toHaveAttribute('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Open visits' }));
    expect(screen.getByText('Visits screen')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Chart' }));
    // The chart's field kept its value (same element, never unmounted).
    expect((within(panel('chart')).getByLabelText('Chart field') as HTMLInputElement).value).toBe('Rex');

    fireEvent.click(screen.getByRole('tab', { name: 'Patients' }));
    // The pushed screen is still on top of the Patients stack.
    expect(within(panel('patients')).getByText('Visits screen')).toBeInTheDocument();
  });

  it('keeps each tab’s scroll container (same element) across switches', () => {
    // jsdom doesn't scroll; the scroll position lives on this element, which
    // must never be remounted (and the CSS keeps hidden panels laid out with
    // visibility, not display:none, which would reset scrollTop in WebKit).
    mockWidth('compact');
    render(<Harness />);
    const chartLayer = panel('chart').querySelector<HTMLElement>('.ios-stack__layer');
    expect(chartLayer).not.toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Rechecks' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Chart' }));
    expect(panel('chart').querySelector<HTMLElement>('.ios-stack__layer')).toBe(chartLayer);
  });

  it('tapping the selected tab again pops its stack to the root', async () => {
    mockWidth('compact');
    render(<Harness initial="patients" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open visits' }));
    expect(screen.getByText('Visits screen')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Patients' }));
    await waitFor(() => expect(screen.queryByText('Visits screen')).toBeNull());
  });

  it('openChart(id) from Patients opens the chart and lands on the Chart tab at its root', async () => {
    mockWidth('compact');
    const onOpenChart = vi.fn(async () => true);
    render(<Harness onOpenChart={onOpenChart} />);
    fireEvent.click(screen.getByRole('button', { name: 'Push on chart' }));
    expect(screen.getByText('Chart detail screen')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Patients' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open chart' }));
    });
    expect(onOpenChart).toHaveBeenCalledWith('c-42');
    expect(screen.getByRole('tab', { name: 'Chart' })).toHaveAttribute('aria-selected', 'true');
    expect(panel('chart')).not.toHaveAttribute('hidden');
    await waitFor(() => expect(screen.queryByText('Chart detail screen')).toBeNull());
  });

  it('controllerRef.showChart() lands on the Chart tab and pops its stack', async () => {
    mockWidth('compact');
    const ref = React.createRef<AppShellHandle>();
    render(<Harness controllerRef={ref} />);
    fireEvent.click(screen.getByRole('button', { name: 'Push on chart' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    act(() => ref.current!.showChart());
    expect(screen.getByRole('tab', { name: 'Chart' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.queryByText('Chart detail screen')).toBeNull());
  });

  it('stays on Patients when opening the chart is cancelled', async () => {
    mockWidth('compact');
    const onOpenChart = vi.fn(async () => false);
    render(<Harness initial="patients" onOpenChart={onOpenChart} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open chart' }));
    });
    expect(screen.getByRole('tab', { name: 'Patients' })).toHaveAttribute('aria-selected', 'true');
  });

  it('useAppShell() outside the shell throws a clear error', () => {
    const Bad = () => {
      useAppShell();
      return null;
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Bad />)).toThrow(/inside <AppShell>/);
  });
});

describe('AppShell (iPad landscape: docked sidebar)', () => {
  it('renders a sidebar with the four destinations and the chart sections, and no tab bar', () => {
    mockWidth('landscape');
    render(<Harness />);
    expect(screen.queryByRole('tablist')).toBeNull();
    const sidebar = screen.getByRole('navigation', { name: 'ToothOps' });
    const labels = within(sidebar).getAllByRole('button').map((b) => b.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Chart', 'Patient', 'Charting', 'Patients', 'Rechecks', 'Settings']));
    expect(within(sidebar).getByRole('button', { name: 'Chart' })).toHaveAttribute('aria-current', 'page');
  });

  it('switches tabs from the sidebar and keeps tabs mounted', () => {
    mockWidth('landscape');
    const onTabChange = vi.fn();
    render(<Harness onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rechecks' }));
    expect(onTabChange).toHaveBeenCalledWith('rechecks');
    expect(panel('rechecks')).not.toHaveAttribute('hidden');
    expect(panel('chart')).toHaveAttribute('hidden');
    expect(screen.getByLabelText('Chart field', { selector: 'input' })).toBeInTheDocument();
  });

  it('a chart section in the sidebar goes to the Chart tab and that section', () => {
    mockWidth('landscape');
    const onChartSection = vi.fn();
    render(<Harness initial="settings" onChartSection={onChartSection} />);
    fireEvent.click(screen.getByRole('button', { name: 'Charting' }));
    expect(onChartSection).toHaveBeenCalledWith('charting');
    expect(panel('chart')).not.toHaveAttribute('hidden');
  });

  it('the sidebar collapses and comes back; both toggles control it', () => {
    mockWidth('landscape');
    render(<Harness />);
    const aside = document.querySelector('.ios-appshell__sidebar')!;
    expect(aside.id).not.toBe('');
    expect(screen.getByRole('button', { name: 'Hide sidebar' })).toHaveAttribute('aria-controls', aside.id);
    fireEvent.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    expect(screen.getByRole('button', { name: 'Show sidebar' })).toHaveAttribute('aria-controls', aside.id);
    expect(document.querySelector('.ios-appshell')).toHaveClass('ios-appshell--sidebar-collapsed');
    expect(screen.getByRole('navigation', { name: 'ToothOps', hidden: true }).closest('[inert]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
    expect(document.querySelector('.ios-appshell')).not.toHaveClass('ios-appshell--sidebar-collapsed');
  });
});

describe('AppShell (iPad portrait: overlay sidebar)', () => {
  it('uses the sidebar (not the tab bar), hidden by default', () => {
    mockWidth('portrait');
    render(<Harness />);
    expect(screen.queryByRole('tablist')).toBeNull();
    const shell = document.querySelector('.ios-appshell')!;
    expect(shell).toHaveClass('ios-appshell--sidebar', 'ios-appshell--sidebar-overlay', 'ios-appshell--sidebar-collapsed');
    expect(document.querySelector('.ios-appshell__sidebar')).toHaveAttribute('inert');
  });

  it('the sidebar button shows it over the content; a choice or the scrim closes it', () => {
    mockWidth('portrait');
    const onTabChange = vi.fn();
    render(<Harness onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
    const shell = document.querySelector('.ios-appshell')!;
    expect(shell).not.toHaveClass('ios-appshell--sidebar-collapsed');
    expect(document.querySelector('.ios-appshell__scrim')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Patients' }));
    expect(onTabChange).toHaveBeenCalledWith('patients');
    expect(shell).toHaveClass('ios-appshell--sidebar-collapsed');

    fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
    fireEvent.click(document.querySelector('.ios-appshell__scrim')!);
    expect(shell).toHaveClass('ios-appshell--sidebar-collapsed');
  });
});

describe('AppShell (iPad portrait: overlay sidebar is modal)', () => {
  it('moves focus into the sidebar when shown; content behind is inert until it closes', () => {
    mockWidth('portrait');
    render(<Harness />);
    const content = document.querySelector('.ios-appshell__content')!;
    expect(content).not.toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
    const aside = document.querySelector('.ios-appshell__sidebar')!;
    expect(aside.contains(document.activeElement)).toBe(true);
    expect(content).toHaveAttribute('inert');
    fireEvent.click(document.querySelector('.ios-appshell__scrim')!);
    expect(content).not.toHaveAttribute('inert');
  });

  it('Escape closes it from anywhere and returns focus to the sidebar button', () => {
    mockWidth('portrait');
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(document.querySelector('.ios-appshell')).toHaveClass('ios-appshell--sidebar-collapsed');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Show sidebar' }));
  });

  it('an open sheet takes Escape before the overlay sidebar', async () => {
    mockWidth('portrait');
    const onClose = vi.fn();
    const { rerender } = render(<><Harness /><Sheet open={false} onClose={onClose} title="S"><p>s</p></Sheet></>);
    fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
    rerender(<><Harness /><Sheet open onClose={onClose} title="S"><p>s</p></Sheet></>);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(document.querySelector('.ios-appshell')).not.toHaveClass('ios-appshell--sidebar-collapsed');
  });

  it('the docked sidebar never makes the content inert', () => {
    mockWidth('landscape');
    render(<Harness />);
    expect(document.querySelector('.ios-appshell__content')).not.toHaveAttribute('inert');
  });
});

describe('AppShell (compact width on iPad: Slide Over / narrow split)', () => {
  it('falls back to the tab bar', () => {
    mockWidth('compact');
    render(<Harness />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(document.querySelector('.ios-appshell__sidebar')).toBeNull();
  });
});
