import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell, useAppShell, type AppTab, REGULAR_WIDTH_QUERY } from './AppShell';
import { useStack } from './Stack';

vi.mock('../native/haptics', () => ({ hapticSelection: vi.fn(), hapticTap: vi.fn(), hapticImpact: vi.fn(), hapticSuccess: vi.fn() }));

const realMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

/** Pretend the window is (or isn't) iPad regular width. */
function mockRegularWidth(regular: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: q === REGULAR_WIDTH_QUERY ? regular : false,
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
  return <input aria-label="Chart field" value={text} onChange={(e) => setText(e.target.value)} />;
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
}: {
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
    mockRegularWidth(false);
    render(<Harness />);
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Chart', 'Patients', 'Rechecks', 'Settings']);
    expect(screen.getByRole('tab', { name: 'Chart' })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('.ios-appshell__sidebar')).toBeNull();
  });

  it('keeps every tab mounted when switching, so state and pushed screens survive', async () => {
    mockRegularWidth(false);
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
    mockRegularWidth(false);
    render(<Harness />);
    const chartLayer = panel('chart').querySelector<HTMLElement>('.ios-stack__layer');
    expect(chartLayer).not.toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Rechecks' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Chart' }));
    expect(panel('chart').querySelector<HTMLElement>('.ios-stack__layer')).toBe(chartLayer);
  });

  it('tapping the selected tab again pops its stack to the root', async () => {
    mockRegularWidth(false);
    render(<Harness initial="patients" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open visits' }));
    expect(screen.getByText('Visits screen')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Patients' }));
    await waitFor(() => expect(screen.queryByText('Visits screen')).toBeNull());
  });

  it('openChart(id) from Patients opens the chart and lands on the Chart tab', async () => {
    mockRegularWidth(false);
    const onOpenChart = vi.fn(async () => true);
    render(<Harness initial="patients" onOpenChart={onOpenChart} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open chart' }));
    });
    expect(onOpenChart).toHaveBeenCalledWith('c-42');
    expect(screen.getByRole('tab', { name: 'Chart' })).toHaveAttribute('aria-selected', 'true');
    expect(panel('chart')).not.toHaveAttribute('hidden');
  });

  it('stays on Patients when opening the chart is cancelled', async () => {
    mockRegularWidth(false);
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

describe('AppShell (iPad regular width)', () => {
  it('renders a sidebar with the four destinations and the chart sections, and no tab bar', () => {
    mockRegularWidth(true);
    render(<Harness />);
    expect(screen.queryByRole('tablist')).toBeNull();
    const sidebar = screen.getByRole('navigation', { name: 'ToothOps' });
    const labels = within(sidebar).getAllByRole('button').map((b) => b.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Chart', 'Patient', 'Charting', 'Patients', 'Rechecks', 'Settings']));
    expect(within(sidebar).getByRole('button', { name: 'Chart' })).toHaveAttribute('aria-current', 'page');
  });

  it('switches tabs from the sidebar and keeps tabs mounted', () => {
    mockRegularWidth(true);
    const onTabChange = vi.fn();
    render(<Harness onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rechecks' }));
    expect(onTabChange).toHaveBeenCalledWith('rechecks');
    expect(panel('rechecks')).not.toHaveAttribute('hidden');
    expect(panel('chart')).toHaveAttribute('hidden');
    expect(screen.getByLabelText('Chart field', { selector: 'input' })).toBeInTheDocument();
  });

  it('a chart section in the sidebar goes to the Chart tab and that section', () => {
    mockRegularWidth(true);
    const onChartSection = vi.fn();
    render(<Harness initial="settings" onChartSection={onChartSection} />);
    fireEvent.click(screen.getByRole('button', { name: 'Charting' }));
    expect(onChartSection).toHaveBeenCalledWith('charting');
    expect(panel('chart')).not.toHaveAttribute('hidden');
  });

  it('the sidebar collapses and comes back', () => {
    mockRegularWidth(true);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    expect(document.querySelector('.ios-appshell')).toHaveClass('ios-appshell--sidebar-collapsed');
    expect(screen.getByRole('navigation', { name: 'ToothOps', hidden: true }).closest('[inert]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
    expect(document.querySelector('.ios-appshell')).not.toHaveClass('ios-appshell--sidebar-collapsed');
  });
});
