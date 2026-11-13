import { normalizeChartPrefs, DEFAULT_CHART_PREFS } from './chartSettings';

describe('chart settings (per person)', () => {
  it("missing or empty settings change nothing (today's layout)", () => {
    expect(normalizeChartPrefs(null)).toEqual(DEFAULT_CHART_PREFS);
    expect(normalizeChartPrefs({})).toEqual(DEFAULT_CHART_PREFS);
    expect(DEFAULT_CHART_PREFS).toMatchObject({
      pocketMode: 'tooth', hiddenColumns: [], mirrorToDiagnosis: false, chartingView: 'grid',
      pdfIncludeGrid: true, pdfIncludeImages: true, hideRecheck: false,
    });
    expect(DEFAULT_CHART_PREFS.besideTeeth).toHaveLength(8);
  });

  it('keeps valid values and drops junk', () => {
    expect(normalizeChartPrefs({ pocketMode: 'root', hiddenColumns: ['recession', 'bogus', 3], besideTeeth: ['pocket'], hideRecheck: true }))
      .toMatchObject({ pocketMode: 'root', hiddenColumns: ['recession'], besideTeeth: ['pocket'], hideRecheck: true });
    expect(normalizeChartPrefs({ pocketMode: 'weird', hideRecheck: 'yes' })).toMatchObject({ pocketMode: 'tooth', hideRecheck: false });
  });

  it('score taps go to the next finding by default; junk falls back', () => {
    expect(DEFAULT_CHART_PREFS.scoreTapMoves).toBe('finding');
    expect(normalizeChartPrefs({ scoreTapMoves: 'tooth' }).scoreTapMoves).toBe('tooth');
    expect(normalizeChartPrefs({ scoreTapMoves: 'stay' }).scoreTapMoves).toBe('stay');
    expect(normalizeChartPrefs({ scoreTapMoves: 'sideways' }).scoreTapMoves).toBe('finding');
  });

  it("fills gaps from a fallback (this browser's old choices)", () => {
    const fallback = { ...DEFAULT_CHART_PREFS, mirrorToDiagnosis: true, chartingView: 'tooth' as const };
    expect(normalizeChartPrefs({ hideRecheck: true }, fallback)).toMatchObject({ mirrorToDiagnosis: true, chartingView: 'tooth', hideRecheck: true });
  });
});

describe('anesthesia settings', () => {
  it('defaults: every block shown, no usual anesthetic', () => {
    expect(normalizeChartPrefs({})).toMatchObject({ hiddenBlocks: [], usualDrug: null });
  });
  it('keeps valid values and drops junk', () => {
    expect(normalizeChartPrefs({ hiddenBlocks: ['mental', 'bogus'], usualDrug: { name: ' Lidocaine ', concentration: '2%' } }))
      .toMatchObject({ hiddenBlocks: ['mental'], usualDrug: { name: 'Lidocaine', concentration: '2' } });
    expect(normalizeChartPrefs({ usualDrug: { name: '  ' } }).usualDrug).toBeNull();
  });
});
