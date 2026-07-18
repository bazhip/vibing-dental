import React from 'react';
import { Species, ToothMarks, DiagramComment, DiagramStroke } from '../types';
import { ToothDiagram, ToothDiagramHandle, DiagramTool, MarkMode, CommentExport } from './ToothDiagram';
import { TOOTH_DIAGRAMS } from '../constants/toothShapes';
import { useDiagramHistory } from '../hooks/useDiagramHistory';
import { usePersistedState } from '../hooks/usePersistedState';

interface DiagramViewProps {
  title: string;
  species: Species;
  toothMarks: ToothMarks;
  onToothMarksChange: (marks: ToothMarks) => void;
  comments: DiagramComment[];
  onCommentsChange: (comments: DiagramComment[]) => void;
  strokes: DiagramStroke[];
  onStrokesChange: (strokes: DiagramStroke[]) => void;
  /** Triadans that the user can't toggle in this diagram (e.g. teeth missing
   *  pre-surgery, when this is the post-surgery diagram). */
  lockedTriadans?: Set<number>;
  /** Restricts the click cycle to a single mark type per diagram. */
  markMode?: MarkMode;
  /** Tool selected when the diagram first mounts (default 'mark'). */
  defaultTool?: DiagramTool;
  /** Tooth to flash (e.g. the one AI autofill just edited). */
  highlightTriadan?: number | null;
}

export interface DiagramViewHandle {
  getSvgElement: () => SVGSVGElement | null;
  getCommentExports: () => CommentExport[];
}

const STROKE_COLORS: Array<{ value: string; label: string }> = [
  { value: '#e53e3e', label: 'red' },
  { value: '#3182ce', label: 'blue' },
  { value: '#38a169', label: 'green' },
  { value: '#d69e2e', label: 'amber' },
  { value: '#2d3748', label: 'charcoal' },
];

/** Comment text-size preset — multiplier applied to the 0.95rem base
 *  CSS font size via a CSS custom property on the .diagram-view root. */
const TEXT_SIZES: Array<{ value: number; label: string }> = [
  { value: 0.8, label: 'S' },
  { value: 1.0, label: 'M' },
  { value: 1.2, label: 'L' },
  { value: 1.5, label: 'XL' },
];

export const DiagramView = React.forwardRef<DiagramViewHandle, DiagramViewProps>(({
  title,
  species,
  toothMarks,
  onToothMarksChange,
  comments,
  onCommentsChange,
  strokes,
  onStrokesChange,
  lockedTriadans,
  markMode,
  defaultTool = 'mark',
  highlightTriadan,
}, ref) => {
  const [tool, setTool] = React.useState<DiagramTool>(defaultTool);
  const [strokeColor, setStrokeColor] = React.useState<string>(STROKE_COLORS[0].value);
  const [strokeWidth, setStrokeWidth] = React.useState<number>(2.5);
  // Comment-text size preference. Persisted so the user's pick survives
  // a refresh. Same key for both Diagnosis + Procedure — most vets want
  // the same text size on both diagrams. Default is Medium (1.0); the
  // version bump on this key clears any stale value from earlier
  // experiments so everyone lands on M.
  const [commentTextScale, setCommentTextScale] = usePersistedState<number>(
    'diagram.commentTextScale', 2, 1.0
  );
  const innerRef = React.useRef<ToothDiagramHandle>(null);

  // Each diagram has its own undo stack. The id (stable per instance via
  // React.useId) routes Cmd+Z to whichever diagram the user touched last.
  const diagramId = React.useId();
  const history = useDiagramHistory(
    diagramId,
    toothMarks,
    comments,
    strokes,
    {
      onMarks: onToothMarksChange,
      onComments: onCommentsChange,
      onStrokes: onStrokesChange,
    }
  );

  React.useImperativeHandle(ref, () => ({
    getSvgElement: () => innerRef.current?.getSvgElement() ?? null,
    getCommentExports: () => innerRef.current?.getCommentExports() ?? [],
  }));

  const addFreeComment = () => {
    const id = `c${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    // Seed somewhere visible — the diagram's center (just below the
    // R/L midline). The user drags from there.
    const diag = TOOTH_DIAGRAMS[species];
    const x = diag.width / 2 - 65;
    const y = diag.midlineY + 20;
    onCommentsChange([
      ...comments,
      { id, text: '', anchorTriadan: null, x, y },
    ]);
  };

  const clearStrokes = () => onStrokesChange([]);

  return (
    <div className="diagram-section">
      <div className="dental-grid__section-header">
        <span className="dental-grid__title">{title}</span>
      </div>

      <div
        className="diagram-view"
        onMouseDown={history.claim}
        // Drives `.diagram-comment { font-size: var(...) }` so the text
        // size box affects every comment in this diagram.
        style={{ ['--diagram-comment-font-size' as string]: `${0.95 * commentTextScale}rem` }}
      >
        <div className="diagram-view__toolbar">
          <div
            className="diagram-view__tool-group"
            role="group"
            aria-label="Diagram tool"
          >
            <button
              type="button"
              className={`diagram-view__tool ${tool === 'mark' ? 'diagram-view__tool--active' : ''}`}
              onClick={() => setTool('mark')}
              aria-pressed={tool === 'mark'}
            >
              Mark
            </button>
            <button
              type="button"
              className={`diagram-view__tool ${tool === 'comment' ? 'diagram-view__tool--active' : ''}`}
              onClick={() => setTool('comment')}
              aria-pressed={tool === 'comment'}
            >
              💬 Comment
            </button>
            <button
              type="button"
              className={`diagram-view__tool ${tool === 'draw' ? 'diagram-view__tool--active' : ''}`}
              onClick={() => setTool('draw')}
              aria-pressed={tool === 'draw'}
            >
              ✏️ Draw
            </button>
          </div>

          <div
            className="diagram-view__history"
            role="group"
            aria-label="Undo / Redo"
          >
            <button
              type="button"
              className="diagram-view__action"
              onClick={history.undo}
              disabled={!history.canUndo}
              aria-label="Undo"
              title="Undo (⌘Z)"
            >
              ↶
            </button>
            <button
              type="button"
              className="diagram-view__action"
              onClick={history.redo}
              disabled={!history.canRedo}
              aria-label="Redo"
              title="Redo (⌘⇧Z)"
            >
              ↷
            </button>
          </div>

          <button type="button" className="diagram-view__action" onClick={addFreeComment}>
            + Free comment
          </button>

          {/* Text-size picker. Visible whenever the tool isn't Draw — i.e.
              Mark and Comment, since both modes work alongside comment
              boxes whose text size this controls. */}
          {tool !== 'draw' && (
            <div
              className="diagram-view__textsize"
              role="group"
              aria-label="Comment text size"
            >
              <span className="diagram-view__textsize-label" aria-hidden="true">A</span>
              {TEXT_SIZES.map((s) => (
                <button
                  type="button"
                  key={s.label}
                  className={`diagram-view__textsize-btn ${commentTextScale === s.value ? 'diagram-view__textsize-btn--active' : ''}`}
                  onClick={() => setCommentTextScale(s.value)}
                  aria-pressed={commentTextScale === s.value}
                  aria-label={`Comment text size ${s.label}`}
                  title={`Comment text size: ${s.label}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {tool === 'draw' && (
            <div
              className="diagram-view__draw-controls"
              role="group"
              aria-label="Draw settings"
            >
              <div role="group" aria-label="Stroke color">
                {STROKE_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c.value}
                    className={`diagram-view__color ${strokeColor === c.value ? 'diagram-view__color--active' : ''}`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setStrokeColor(c.value)}
                    aria-label={`Stroke color ${c.label}`}
                    aria-pressed={strokeColor === c.value}
                  />
                ))}
              </div>
              <label className="diagram-view__width-label">
                <span className="visually-hidden">Stroke width</span>
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={0.5}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(parseFloat(e.target.value))}
                  className="diagram-view__width"
                  aria-label="Stroke width"
                  aria-valuetext={`${strokeWidth} pixels`}
                />
              </label>
              <button
                type="button"
                className="diagram-view__action diagram-view__action--danger"
                onClick={clearStrokes}
              >
                Clear strokes
              </button>
            </div>
          )}

        </div>

        <ToothDiagram
          ref={innerRef}
          species={species}
          toothMarks={toothMarks}
          onToothMarksChange={onToothMarksChange}
          comments={comments}
          onCommentsChange={onCommentsChange}
          strokes={strokes}
          onStrokesChange={onStrokesChange}
          tool={tool}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          lockedTriadans={lockedTriadans}
          markMode={markMode}
          highlightTriadan={highlightTriadan}
        />
      </div>
    </div>
  );
});

DiagramView.displayName = 'DiagramView';
