import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import i18n, { loadLanguage } from '../i18n';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import glossary from '../locales/glossary.json';
import { getInitialToothData } from '../constants';
import { columnLabel } from '../constants/columnDefinitions';
import { DiagramComment, ToothData, ToothMarks } from '../types';
import { installScopeSelectorFallback } from '../utils/scopeSelector';
import { toothDisplayName } from '../utils/toothChart';
import { DentalGrid } from './DentalGrid';
import { ToothChartView } from './ToothChartView';
import { DiagramView } from './DiagramView';
import { ScoreChips } from './ScoreChips';
import { QuickCodeChips } from './QuickCodeChips';
import { QuickCodesEditor } from './QuickCodesEditor';
import { CodeField } from './CodeField';
import { CodeReferencePanel } from './CodeReferencePanel';
import './ToothDiagram';
import './toothDiagram/layoutComments';
import '../utils/pocket';

beforeAll(() => {
  window.ResizeObserver =
    window.ResizeObserver ??
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  installScopeSelectorFallback();
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  // The diagram fetches its SVG outline; jsdom has no network.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
beforeEach(installPseudoLocale);
afterEach(restoreLocale);

// Clinical codes stay as codes: tooth names on the Triadan rows (I1, C, P4, M1 …), root
// labels (M, D, MB …), the AVDC score shorthand on the chips (M2, F3, CI1, GI2, PD3) and the
// dental codes themselves (MAL1/BV, T/SN, FX …: upper-case tokens only, so words still count).
// "notes" is the aria-label the test itself puts on its CodeField.
const ALLOW: (string | RegExp)[] = [/^[ICPM]\d?$/i, /^(MB|MP|DB|M|D|P)$/, /^(M|F|CI|GI|PD)\d$/, /^[A-Z][A-Z0-9/*]*$/, 'notes'];

const fixture = (): ToothData[] =>
  getInitialToothData('canine').map((r) =>
    r.triadan === 108 ? { ...r, mobility: '2', pocket: '4', calculus: '1' } : r,
  );

test('the grid is fully translated: header, filled row, Missing state, selection bar', async () => {
  const { container } = render(
    <DentalGrid
      toothData={fixture()}
      onToothDataChange={() => {}}
      toothMarks={{ 104: 'missing', 105: 'missing' }}
      priorGoneTeeth={new Set([105])}
      priorToothData={{ 108: { ...fixture()[0], triadan: 108, pocket: '5' } as ToothData }}
      onToggleMissing={() => {}}
      onMirrorToDiagnosisChange={() => {}}
      onPdfIncludeGridChange={() => {}}
      mirrorToDiagnosis
    />,
  );
  expect(findUntranslated(container, ALLOW)).toEqual([]);
  // Select two teeth to open the bulk-edit bar.
  const tid = container.querySelectorAll('.dental-grid__tid');
  fireEvent.click(tid[0]);
  expect(screen.getByText(/⟦1 tooth selected⟧/)).toBeInTheDocument();
  fireEvent.click(tid[1]);
  expect(screen.getByText(/⟦2 teeth selected⟧/)).toBeInTheDocument();
  expect(findUntranslated(document.body, ALLOW)).toEqual([]);
});

test('per-root pockets, view-only grid and the set-all editor are translated', () => {
  const { container } = render(
    <DentalGrid
      toothData={fixture()}
      onToothDataChange={() => {}}
      toothMarks={{}}
      onToggleMissing={() => {}}
      pocketMode="root"
      species="canine"
      readOnly
    />,
  );
  expect(findUntranslated(container, ALLOW)).toEqual([]);
});

function ChartHarness({ planned = [] as number[], readOnly = false }) {
  const [toothData, setToothData] = React.useState<ToothData[]>(fixture());
  const [post, setPost] = React.useState<ToothMarks>({ 109: 'extracted' });
  const [pre, setPre] = React.useState<DiagramComment[]>([]);
  return (
    <ToothChartView
      readOnly={readOnly}
      species="canine"
      toothData={toothData}
      setToothData={(u) => setToothData(u)}
      preMarks={{ 101: 'missing' }}
      onToggleMissing={() => {}}
      effectivePostMarks={post}
      setPostMarks={(u) => setPost(u)}
      preComments={pre}
      setPreComments={(u) => setPre(u)}
      postComments={[]}
      setPostComments={() => {}}
      plannedExtractions={planned}
      setPlannedExtraction={() => {}}
      pocketMode="root"
      quickCodes={['T/SN', 'T/SR']}
    />
  );
}

test('by-tooth view: empty panel, legend, selected tooth and extraction plan', () => {
  const { container } = render(<ChartHarness planned={[108, 109]} />);
  expect(findUntranslated(container, ALLOW)).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: /⟦Start at/ }));
  expect(findUntranslated(container, ALLOW)).toEqual([]);
  // A multi-rooted tooth with per-root boxes (108 = P4).
  for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole('button', { name: /⟦Next tooth/ }));
  expect(findUntranslated(container, ALLOW)).toEqual([]);
});

test('by-tooth view: view-only', () => {
  const { container } = render(<ChartHarness readOnly planned={[108]} />);
  fireEvent.click(screen.getByRole('button', { name: /⟦Start at/ }));
  expect(findUntranslated(container, ALLOW)).toEqual([]);
});

function DiagramHarness({ markMode, tool }: { markMode?: 'missing-only' | 'extracted-only' | 'all'; tool?: 'mark' | 'comment' | 'draw' }) {
  const [comments, setComments] = React.useState<DiagramComment[]>([
    { id: 'c1', text: 'Fractured', anchorTriadan: 104 },
    { id: 'grid-108', text: 'Mobility 2', anchorTriadan: 108 },
    { id: 'c2', text: 'Free note', anchorTriadan: null, x: 100, y: 100 },
  ]);
  return (
    <DiagramView
      title="Diagnosis"
      onCustomize={() => {}}
      species="canine"
      toothMarks={{ 101: 'missing', 102: 'extracted' }}
      onToothMarksChange={() => {}}
      comments={comments}
      onCommentsChange={setComments}
      strokes={[]}
      onStrokesChange={() => {}}
      lockedTriadans={new Set([101])}
      markMode={markMode}
      defaultTool={tool}
      quickCodes={['T/SN']}
    />
  );
}

test.each([
  ['all', 'mark'],
  ['missing-only', 'mark'],
  ['extracted-only', 'comment'],
  ['all', 'draw'],
] as const)('diagram view (%s, %s) is fully translated', async (markMode, tool) => {
  const { container } = render(<DiagramHarness markMode={markMode} tool={tool} />);
  // The traced outline never loads here; comments, toolbar and labels still render.
  await waitFor(() => expect(container.querySelector('.diagram-comment')).not.toBeNull());
  expect(findUntranslated(container, [...ALLOW, 'Diagnosis', 'Fractured', 'Mobility 2', 'Free note', /^[A-Za-z0-9]+ \(\d{3}\)$/])).toEqual([]);
});

test('diagram quick-code strip, armed and idle, is translated', async () => {
  const { container } = render(<DiagramHarness tool="comment" />);
  await waitFor(() => expect(container.querySelector('.diagram-comment')).not.toBeNull());
  const allow = [...ALLOW, 'Diagnosis', 'Fractured', 'Mobility 2', 'Free note', /^[A-Za-z0-9]+ \(\d{3}\)$/];
  expect(screen.getByText(/⟦Tap a code, then a tooth/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /T\/SN/ }));
  expect(screen.getByText(/⟦Tap a tooth to add T\/SN/)).toBeInTheDocument();
  expect(findUntranslated(container, allow)).toEqual([]);
});

test('quick-code chips and the quick-codes editor are translated', () => {
  const { container } = render(
    <>
      <QuickCodeChips codes={['T/SN', 'OWN1']} isPressed={(c) => c === 'T/SN'} onPick={() => {}} />
      <QuickCodesEditor codes={['T/SN', 'OWN1']} onChange={() => {}} />
    </>,
  );
  expect(findUntranslated(container, ALLOW)).toEqual([]);
});

test('score chips and the code field popup are translated', () => {
  const { container } = render(
    <>
      <ScoreChips name="Tooth 101 Mobility" choices={[{ value: '0', label: 'M0' }, { value: '1', label: 'M1' }]} value="1" onPick={() => {}} clearable />
      <CodeField value="" onChange={() => {}} aria-label="notes" />
    </>,
  );
  expect(findUntranslated(container, ALLOW)).toEqual([]);
});

test('the code popup lists definitions and re-renders when the language changes', async () => {
  function Host() {
    const [v, setV] = React.useState('');
    return <CodeField value={v} onChange={setV} aria-label="notes" />;
  }
  render(<Host />);
  const input = screen.getByLabelText('notes') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'FX', selectionStart: 2 } });
  const first = await screen.findAllByRole('option');
  expect(first.length).toBeGreaterThan(0);
  const before = first[0].textContent;
  await loadLanguage('fr');
  await act(async () => { await i18n.changeLanguage('fr'); });
  await waitFor(() => expect(screen.getAllByRole('option')[0].textContent).not.toBe(before));
});

test.each([[undefined], ['diagnosis'], ['procedure']] as const)('code reference panel (%s)', (kind) => {
  const { container } = render(<CodeReferencePanel kind={kind} />);
  expect(findUntranslated(container, ALLOW)).toEqual([]);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzzzqq' } });
  expect(screen.getAllByText(/⟦No matches\.⟧/).length).toBeGreaterThan(0);
  expect(findUntranslated(container, ALLOW)).toEqual([]);
});

test('tooth names are built from catalog pieces, not concatenated English', () => {
  expect(toothDisplayName(108, 'P4', 'xx')).toBe('⟦⟦Right⟧ ⟦maxillary⟧ ⟦⟦4th⟧ ⟦premolar⟧⟧⟧');
});

describe('French', () => {
  beforeEach(async () => {
    await loadLanguage('fr');
  });

  const term = (id: string) => (glossary.terms.find((t) => t.id === id) as { fr: string }).fr.toLowerCase();

  it('uses the glossary terms for mobility and pocket', async () => {
    await act(async () => { await i18n.changeLanguage('fr'); });
    expect(term('mobility')).toContain(columnLabel('mobility').toLowerCase());
    expect(term('pocket')).toContain(columnLabel('pocket').toLowerCase());
    expect(term('furcation')).toContain(columnLabel('furcation').toLowerCase());
    expect(term('calculus')).toContain(columnLabel('calculus').toLowerCase());
  });

  it('renders the grid, a tooth name and a diagram label in French', async () => {
    await act(async () => { await i18n.changeLanguage('fr'); });
    render(<DentalGrid toothData={fixture()} onToothDataChange={() => {}} toothMarks={{}} onToggleMissing={() => {}} />);
    expect(screen.getByRole('columnheader', { name: /^Mobilité/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^Poche/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Dent 101 absente' })).toBeInTheDocument();
    expect(toothDisplayName(108, 'P4')).toBe('4e prémolaire maxillaire droite');
    expect(toothDisplayName(504, 'c')).toBe('Canine déciduale maxillaire droite');
  });
});
