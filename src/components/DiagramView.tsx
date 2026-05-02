import React from 'react';
import { Species, ToothMarks, DiagramComment, DiagramStroke } from '../types';
import { ToothDiagram, ToothDiagramHandle, DiagramTool, MarkMode, CommentExport } from './ToothDiagram';
import { TOOTH_DIAGRAMS } from '../constants/toothShapes';

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
}, ref) => {
  const [tool, setTool] = React.useState<DiagramTool>('mark');
  const [strokeColor, setStrokeColor] = React.useState<string>(STROKE_COLORS[0].value);
  const [strokeWidth, setStrokeWidth] = React.useState<number>(2.5);
  const innerRef = React.useRef<ToothDiagramHandle>(null);

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

      <div className="diagram-view">
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
              🦷 Mark
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

          {tool === 'comment' && (
            <button type="button" className="diagram-view__action" onClick={addFreeComment}>
              + Free comment
            </button>
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

          <div className="diagram-view__hint" role="status" aria-live="polite">
            {tool === 'mark' && 'Click a tooth to cycle: normal → missing → extracted → normal.'}
            {tool === 'comment' && 'Click a tooth to anchor a comment, or use “Free comment” for a floating note.'}
            {tool === 'draw' && 'Click and drag to draw on the diagram.'}
          </div>
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
        />
      </div>
    </div>
  );
});

DiagramView.displayName = 'DiagramView';
