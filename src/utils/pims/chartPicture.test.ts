import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderChartPicture } from './chartPicture';
import { diagramSvgToPng } from '../svgToPng';
import { TOOTH_DIAGRAMS } from '../../constants/toothShapes';

vi.mock('../svgToPng', () => ({ diagramSvgToPng: vi.fn() }));

const calls: string[] = [];
const ctx = {
  fillRect: vi.fn(),
  fillText: vi.fn((text: string) => { calls.push(text); }),
  drawImage: vi.fn(),
  fillStyle: '', font: '', textBaseline: '',
};

beforeEach(() => {
  calls.length = 0;
  vi.mocked(diagramSvgToPng).mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 50 })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('renderChartPicture', () => {
  it('renders both diagrams with crop bounds and stacks labelled images', async () => {
    const preSvg = {} as SVGSVGElement;
    const postSvg = {} as SVGSVGElement;
    const url = await renderChartPicture(
      { species: 'canine', preSvg, postSvg, preComments: [], postComments: [] },
      { pre: 'PRE', post: 'POST' },
    );
    const { width, height, cropBounds } = TOOTH_DIAGRAMS.canine;
    expect(diagramSvgToPng).toHaveBeenCalledTimes(2);
    expect(vi.mocked(diagramSvgToPng).mock.calls[0][0]).toBe(preSvg);
    expect(vi.mocked(diagramSvgToPng).mock.calls[1][0]).toBe(postSvg);
    for (const c of vi.mocked(diagramSvgToPng).mock.calls) {
      expect(c.slice(1, 3)).toEqual([width, height]);
      expect(c[4]).toBe(2);
      expect(c[6]).toEqual(cropBounds);
    }
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(calls).toEqual(['PRE', 'POST']);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  });
});
