import { layoutComments, COMMENT_W, COMMENT_H, ToothBBox } from './layoutComments';
import { SpeciesDiagram } from '../../constants/toothShapes';
import { DiagramComment } from '../../types';

const diagram: SpeciesDiagram = {
  imageSrc: '/diagrams/test.png',
  width: 800,
  height: 1000,
  midlineY: 500,
  cropBounds: { minY: 0, maxY: 1000 },
  labelCulls: [],
  labels: [],
  midlineDash: { x1: 0, x2: 800, y: 500 },
  teeth: [
    // Right-side tooth (cx < midline=400)
    { triadan: 101, label: 'I1', type: 'incisor', cx: 350, cy: 100, rx: 10, ry: 10, rotation: 0 },
    // Left-side tooth (cx > midline)
    { triadan: 201, label: 'I1', type: 'incisor', cx: 450, cy: 100, rx: 10, ry: 10, rotation: 0 },
  ],
};

describe('layoutComments', () => {
  it('keeps user-positioned comments at their stored coordinates', () => {
    const comments: DiagramComment[] = [
      { id: 'c1', text: 'note', anchorTriadan: null, x: 123, y: 456 },
    ];
    const placed = layoutComments(comments, diagram, new Map());
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ x: 123, y: 456, w: COMMENT_W, h: COMMENT_H });
  });

  it('drops free comments without position near bottom-center', () => {
    const comments: DiagramComment[] = [
      { id: 'c1', text: 'free', anchorTriadan: null },
    ];
    const [placed] = layoutComments(comments, diagram, new Map());
    expect(placed.x).toBe(diagram.width / 2 - COMMENT_W / 2);
    expect(placed.y).toBe(diagram.height - COMMENT_H - 8);
    expect(placed.anchor).toBeNull();
  });

  it('routes right-side anchored comments into the left whitespace gutter', () => {
    const comments: DiagramComment[] = [
      { id: 'c1', text: 'right-tooth', anchorTriadan: 101 },
    ];
    const [placed] = layoutComments(comments, diagram, new Map());
    // Right-side tooth → left of viewBox (negative x).
    expect(placed.x).toBeLessThan(0);
    expect(placed.anchor).toEqual({ x: 350, y: 100, label: 'I1 (101)' });
  });

  it('routes left-side anchored comments into the right whitespace gutter', () => {
    const comments: DiagramComment[] = [
      { id: 'c1', text: 'left-tooth', anchorTriadan: 201 },
    ];
    const [placed] = layoutComments(comments, diagram, new Map());
    // Left-side tooth → right of viewBox (x > diagram.width).
    expect(placed.x).toBeGreaterThanOrEqual(diagram.width);
  });

  it('stacks multiple anchored comments without overlap on the same side', () => {
    const comments: DiagramComment[] = [
      { id: 'c1', text: 'a', anchorTriadan: 101 },
      { id: 'c2', text: 'b', anchorTriadan: 101 },
    ];
    const placed = layoutComments(comments, diagram, new Map());
    const ys = placed.map((p) => p.y).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(COMMENT_H);
  });

  it('uses bbox center over the static tooth.cx/cy when a bbox is provided', () => {
    const bboxes = new Map<number, ToothBBox>([
      [101, { minX: 0, minY: 0, maxX: 0, maxY: 0, cx: 200, cy: 700 }],
    ]);
    const comments: DiagramComment[] = [
      { id: 'c1', text: 'x', anchorTriadan: 101 },
    ];
    const [placed] = layoutComments(comments, diagram, bboxes);
    expect(placed.anchor).toEqual({ x: 200, y: 700, label: 'I1 (101)' });
  });
});
