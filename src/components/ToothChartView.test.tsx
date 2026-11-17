import React from 'react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToothChartView } from './ToothChartView';
import { getInitialToothData } from '../constants';
import { DiagramComment, ToothData, ToothMarks } from '../types';

// The diagram fetches its SVG outline; jsdom has no network, so let the
// load fail quietly — the panel is driven via Previous/Next here.
beforeAll(() => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/** Stateful harness so functional updates land like they do in the app. */
function Harness({ readOnly = false, initialPlanned = [] as number[], quickCodes = [] as string[] }) {
  const [toothData, setToothData] = React.useState<ToothData[]>(getInitialToothData('canine'));
  const [preMarks, setPreMarks] = React.useState<ToothMarks>({});
  const [postMarks, setPostMarks] = React.useState<ToothMarks>({});
  const [pre, setPre] = React.useState<DiagramComment[]>([]);
  const [post, setPost] = React.useState<DiagramComment[]>([]);
  const [planned, setPlanned] = React.useState<number[]>(initialPlanned);
  const effective = { ...postMarks };
  for (const [k, v] of Object.entries(preMarks)) if (v === 'missing') effective[Number(k)] = 'missing';
  return (
    <>
      <ToothChartView
        readOnly={readOnly}
        species="canine"
        toothData={toothData}
        setToothData={(u) => setToothData(u)}
        preMarks={preMarks}
        onToggleMissing={(t) => setPreMarks((m) => {
          const n = { ...m };
          if (n[t]) delete n[t]; else n[t] = 'missing';
          return n;
        })}
        effectivePostMarks={effective}
        setPostMarks={(u) => setPostMarks(u)}
        preComments={pre}
        setPreComments={(u) => setPre(u)}
        postComments={post}
        setPostComments={(u) => setPost(u)}
        plannedExtractions={planned}
        setPlannedExtraction={(t, on) => setPlanned((p) => (on ? [...p.filter((x) => x !== t), t] : p.filter((x) => x !== t)))}
        quickCodes={quickCodes}
      />
      <output data-testid="state">
        {JSON.stringify({ row: toothData.find((r) => r.triadan === 110), preMarks, postMarks, pre, post, planned })}
      </output>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId('state').textContent || '{}');

test('charts a tooth end to end: findings, note, plan, then confirm extraction', () => {
  render(<Harness />);
  expect(screen.getByText(/click a tooth/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /start at 110/i }));
  expect(screen.getByText('Right maxillary 2nd molar')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Pocket'), { target: { value: '5' } });
  expect(state().row.pocket).toBe('5');

  fireEvent.change(screen.getByLabelText(/diagnosis note/i), { target: { value: 'Fractured' } });
  expect(state().pre).toEqual([expect.objectContaining({ text: 'Fractured', anchorTriadan: 110 })]);

  fireEvent.click(screen.getByLabelText('Plan to extract'));
  expect(state().planned).toEqual([110]);
  expect(screen.getByText('0 of 1 confirmed extracted.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Mark it extracted' }));
  expect(state().postMarks).toEqual({ 110: 'extracted' });
  expect(screen.getByLabelText('Extracted')).toBeChecked();
  expect(screen.getByText('All planned extractions confirmed.')).toBeInTheDocument();
});

test('Previous / Next walk the arch and Enter never submits', () => {
  const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
  render(<form onSubmit={onSubmit}><Harness /></form>);
  fireEvent.click(screen.getByRole('button', { name: /start at 110/i }));
  fireEvent.click(screen.getByRole('button', { name: /next tooth \(109\)/i }));
  expect(screen.getByText('109')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /previous tooth \(110\)/i }));
  fireEvent.click(screen.getByRole('button', { name: /previous tooth \(411\)/i }));
  expect(screen.getByText('Right mandibular 3rd molar')).toBeInTheDocument();
  fireEvent.keyDown(screen.getByLabelText('Mobility'), { key: 'Enter' });
  expect(onSubmit).not.toHaveBeenCalled();
});

test('missing teeth lock findings and extraction; out-of-range values are flagged', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: /start at 110/i }));
  fireEvent.change(screen.getByLabelText('Mobility'), { target: { value: '7' } });
  expect(screen.getByLabelText('Mobility')).toHaveAttribute('aria-invalid', 'true');
  fireEvent.click(screen.getByLabelText(/missing/i));
  expect(state().preMarks).toEqual({ 110: 'missing' });
  expect(screen.getByLabelText('Pocket')).toBeDisabled();
  expect(screen.getByLabelText('Plan to extract')).toBeDisabled();
  expect(screen.getByLabelText('Extracted')).toBeDisabled();
});

test('read-only charts can be browsed but not edited', () => {
  render(<Harness readOnly initialPlanned={[110]} />);
  fireEvent.click(screen.getByRole('button', { name: /start at 110/i }));
  expect(screen.getByLabelText('Pocket')).toBeDisabled();
  expect(screen.getByLabelText(/diagnosis note/i)).toBeDisabled();
  expect(screen.queryByRole('button', { name: /mark it extracted/i })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /next tooth/i }));
  expect(screen.getByText('109')).toBeInTheDocument();
});

test('short-scale findings can be tapped: F2 sets furcation, tapping it again clears', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: /start at 110/i }));
  const furcation = screen.getByRole('group', { name: 'Furcation score' });
  expect(Array.from(furcation.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['F0', 'F1', 'F2', 'F3']);
  fireEvent.click(screen.getByRole('button', { name: 'F2' }));
  expect(state().row.furcation).toBe('2');
  expect(screen.getByRole('button', { name: 'F2' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'F2' }));
  expect(state().row.furcation).toBe('');
  expect(screen.queryByRole('group', { name: 'Pocket score' })).toBeNull();
});

test('a quick code adds to the diagnosis note and a second tap takes it out', () => {
  render(<Harness quickCodes={['T/SN']} />);
  fireEvent.click(screen.getByRole('button', { name: /start at 110/i }));
  const chip = screen.getByRole('button', { name: 'T/SN: Supernumerary tooth' });
  expect(chip).toHaveAttribute('aria-pressed', 'false');

  fireEvent.click(chip);
  expect(state().pre).toEqual([expect.objectContaining({ text: 'T/SN', anchorTriadan: 110 })]);
  expect(chip).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText(/diagnosis note/i)).toHaveValue('T/SN');

  // Typed text is kept around the code.
  fireEvent.change(screen.getByLabelText(/diagnosis note/i), { target: { value: 'Rotated T/SN' } });
  fireEvent.click(chip);
  expect(state().pre).toEqual([expect.objectContaining({ text: 'Rotated', anchorTriadan: 110 })]);
  expect(chip).toHaveAttribute('aria-pressed', 'false');
});

test('quick codes are off on a view-only chart and absent when none are set', () => {
  const { unmount } = render(<Harness readOnly quickCodes={['T/SN']} />);
  fireEvent.click(screen.getByRole('button', { name: /start at 110/i }));
  expect(screen.getByRole('button', { name: 'T/SN: Supernumerary tooth' })).toBeDisabled();
  unmount();
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: /start at 110/i }));
  expect(screen.queryByRole('group', { name: 'Quick codes' })).toBeNull();
});

test('navigation stays outside the scrolling fields and the mobile map can be toggled', () => {
  const { container } = render(<Harness />);
  const map = screen.getByRole('button', { name: 'Tooth map' });
  expect(map).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(map);
  expect(map).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: /start at 110/i }));
  expect(map).toHaveAttribute('aria-expanded', 'false');
  const body = container.querySelector('.tooth-chart__body')!;
  expect(body).toContainElement(screen.getByLabelText('Pocket'));
  expect(body).not.toContainElement(screen.getByRole('button', { name: /next tooth/i }));
  fireEvent.change(screen.getByLabelText('Pocket'), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: /next tooth/i }));
  fireEvent.click(screen.getByRole('button', { name: /previous tooth/i }));
  expect(screen.getByLabelText('Pocket')).toHaveValue('4');
});

test('sizes the mobile editor to the remaining viewport and updates on resize', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true } as MediaQueryList)));
  const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 350 } as DOMRect);
  const originalHeight = window.innerHeight;
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 568 });
  try {
    const { container } = render(<Harness />);
    const panel = container.querySelector('.tooth-chart__panel') as HTMLElement;
    expect(panel.style.maxHeight).toBe('210px');
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    fireEvent(window, new Event('resize'));
    expect(panel.style.maxHeight).toBe('486px');
  } finally {
    vi.unstubAllGlobals();
    bounds.mockRestore();
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight });
  }
});

test('touch map browses quadrants, selects the named tooth and preserves findings', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Tooth map' }));
  fireEvent.change(screen.getByLabelText('Quadrant'), { target: { value: '3' } });
  expect(screen.queryByRole('button', { name: /Select tooth 110:/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Select tooth 311:/ }));
  expect(screen.getByText('Left mandibular 3rd molar')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tooth map' })).toHaveAttribute('aria-expanded', 'false');
  fireEvent.change(screen.getByLabelText('Pocket'), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: /next tooth \(310\)/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Tooth map' }));
  expect(screen.getByLabelText('Quadrant')).toHaveValue('3');
  expect(screen.getByRole('button', { name: /Select tooth 310:/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: /Select tooth 311:/ }));
  expect(screen.getByLabelText('Pocket')).toHaveValue('4');
});

test('touch map can select teeth in a read-only chart', () => {
  render(<Harness readOnly />);
  fireEvent.click(screen.getByRole('button', { name: 'Tooth map' }));
  fireEvent.change(screen.getByLabelText('Quadrant'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: /Select tooth 201:/ }));
  expect(screen.getByLabelText('Pocket')).toBeDisabled();
  expect(screen.getByRole('button', { name: /next tooth \(202\)/i })).toBeEnabled();
});

test('keyboard selection in the tooth map restores focus to the selected tooth heading', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Tooth map' }));
  const toothButton = screen.getByRole('button', { name: /Select tooth 110:/ });
  toothButton.focus();
  await user.keyboard('{Enter}');
  const heading = screen.getByRole('heading', { name: /110.*Right maxillary 2nd molar/ });
  expect(heading).toHaveFocus();
  expect(screen.queryByRole('button', { name: /Select tooth 110:/ })).toBeNull();
  await user.tab();
  expect(screen.getByRole('button', { name: /next tooth \(109\)/i })).toHaveFocus();
  // Selecting the same tooth must also restore focus when only the map changes.
  await user.click(screen.getByRole('button', { name: 'Tooth map' }));
  screen.getByRole('button', { name: /Select tooth 110:/ }).focus();
  await user.keyboard(' ');
  expect(heading).toHaveFocus();
});
