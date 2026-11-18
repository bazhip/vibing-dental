import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS, type ChartSnapshot } from '../../types';

const picture = vi.hoisted(() => ({ renderChartPicture: vi.fn(async () => 'data:image/png;base64,AAAA') }));
vi.mock('../../utils/pims/chartPicture', () => picture);

import { useOffscreenChartPicture, type OffscreenChartPictureApi } from './OffscreenChartPicture';

beforeAll(() => {
  window.ResizeObserver = window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => { cleanup(); picture.renderChartPicture.mockClear(); });

const snapshot = {
  patientInfo: {
    patientName: 'Bella', patientNumber: '1', doctor: '', tech: '', date: '2026-11-11', complaint: '',
    treatmentReport: '', recallDate: '', nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
  },
  toothData: [], species: 'canine', logo: 'socal',
  preMarks: { 103: 'missing' }, preComments: [], preStrokes: [],
  postMarks: {}, postComments: [], postStrokes: [],
} as unknown as ChartSnapshot;

function mount(snap: ChartSnapshot | null) {
  const api: { current: OffscreenChartPictureApi | null } = { current: null };
  const Probe = () => { api.current = useOffscreenChartPicture(snap); return api.current.element; };
  render(<Probe />);
  return api;
}

describe('useOffscreenChartPicture', () => {
  it('mounts both diagrams off-screen (not display:none) and reports hasDiagrams', () => {
    const api = mount(snapshot);
    const host = document.querySelector<HTMLElement>('[data-testid="offscreen-chart-picture"]')!;
    expect(host.style.insetInlineStart).toBe('-10000px');
    expect(host.style.display).not.toBe('none');
    expect(host.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
    expect(api.current!.hasDiagrams).toBe(true);
  });

  it('render passes both SVGs, comment exports and translated labels to renderChartPicture', async () => {
    const api = mount(snapshot);
    let out: string | null = null;
    await act(async () => { out = await api.current!.render(); });
    expect(out).toBe('data:image/png;base64,AAAA');
    const [snap, labels] = picture.renderChartPicture.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, string>];
    expect(snap.species).toBe('canine');
    expect(snap.preSvg).toBeInstanceOf(SVGSVGElement);
    expect(snap.postSvg).toBeInstanceOf(SVGSVGElement);
    expect(snap.preSvg).not.toBe(snap.postSvg);
    expect(snap.preComments).toEqual([]);
    expect(snap.postComments).toEqual([]);
    expect(labels).toEqual({ pre: 'Pre-op chart', post: 'Post-op chart' });
  });

  it('chart without diagrams sends text only: render is null and hasDiagrams false', async () => {
    const api = mount(null);
    expect(api.current!.hasDiagrams).toBe(false);
    let out: string | null = 'x';
    await act(async () => { out = await api.current!.render(); });
    expect(out).toBeNull();
    expect(picture.renderChartPicture).not.toHaveBeenCalled();
  });
});
