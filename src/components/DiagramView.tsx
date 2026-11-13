import React from 'react';
import { useTranslation } from 'react-i18next';

/** Shortcut hints match the platform (⌘ on Apple devices, Ctrl elsewhere). */
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
import { Species, ToothMarks, DiagramComment, DiagramStroke } from '../types';
import { ToothDiagram, ToothDiagramHandle, DiagramTool, MarkMode, CommentExport } from './ToothDiagram';
import { TOOTH_DIAGRAMS } from '../constants/toothShapes';
import { useDiagramHistory } from '../hooks/useDiagramHistory';
import { usePersistedState } from '../hooks/usePersistedState';
import { isNativeApp } from '../native/platform';
import { Icon } from '../ios/icons';

// SF Symbol names (not text).
const ARROW_UTURN_BACKWARD_ICON = 'arrow-uturn-backward';
const ARROW_UTURN_FORWARD_ICON = 'arrow-uturn-forward';
const MINUS_ICON = 'minus';
const PLUS_ICON = 'plus';

interface DiagramViewProps {
  title: string;
  /** Open this page's settings (Customize in the header). */
  onCustomize?: () => void;
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
  /** Locked (saved chart being viewed): keyboard undo is off. */
  readOnly?: boolean;
}

export interface DiagramViewHandle {
  getSvgElement: () => SVGSVGElement | null;
  getCommentExports: () => CommentExport[];
}

const STROKE_COLORS = [
  { value: '#e53e3e', name: 'red' },
  { value: '#3182ce', name: 'blue' },
  { value: '#38a169', name: 'green' },
  { value: '#d69e2e', name: 'amber' },
  { value: '#2d3748', name: 'charcoal' },
] as const;

/** Comment text-size preset — multiplier applied to the 0.95rem base
 *  CSS font size via a CSS custom property on the .diagram-view root. */
const TEXT_SIZES = [
  { value: 0.8, name: 's' },
  { value: 1.0, name: 'm' },
  { value: 1.2, name: 'l' },
  { value: 1.5, name: 'xl' },
] as const;

export const DiagramView = React.forwardRef<DiagramViewHandle, DiagramViewProps>(({
  title,
      onCustomize,
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
  readOnly = false,
}, ref) => {
  // The iOS app draws toolbar symbols as icons, not text glyphs.
  const native = isNativeApp();
  const { t } = useTranslation('chart');
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [tool, setTool] = React.useState<DiagramTool>(defaultTool);
  const [strokeColor, setStrokeColor] = React.useState<string>(STROKE_COLORS[0].value);
  const [strokeWidth, setStrokeWidth] = React.useState<number>(2.5);
  // Zoom scales the whole canvas (teeth, marks, comments) by widening
  // the diagram inside a scrollable viewport — everything in the wrapper
  // is %-positioned, so one CSS variable does it. Not persisted: zoom is
  // a momentary "let me get closer" gesture, and every chart should open
  // at fit-to-width.
  const [zoom, setZoom] = React.useState(1);
  // Compact screens: secondary controls live in a "⋯" pop-over so the
  // toolbar stays one line (mode · undo/redo · more).
  const [moreOpen, setMoreOpen] = React.useState(false);
  const moreRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3;
  const zoomBy = (factor: number) =>
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * factor * 100) / 100)));
  // Comment-text size preference. Persisted so the user's pick survives
  // a refresh. Same key for both Diagnosis + Procedure — most vets want
  // the same text size on both diagrams. Default is Medium (1.0); the
  // version bump on this key clears any stale value from earlier
  // experiments so everyone lands on M.
  const [commentTextScale, setCommentTextScale] = usePersistedState<number>(
    'diagram.commentTextScale', 2, 1.0
  );
  // Always-on Triadan numbers next to each tooth — optional, off by
  // default (the hover tooltip still names a tooth). Per-browser, shared
  // by both diagrams. Screen only; never printed on the PDF.
  const [showNumbers, setShowNumbers] = usePersistedState<boolean>(
    'diagram.showToothNumbers', 1, false
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
    },
    { scopeRef: rootRef, disabled: readOnly }
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
    <div className="diagram-section" ref={rootRef}>
      <div className="dental-grid__section-header">
        <h2 className="dental-grid__title">{title}</h2>
        {onCustomize && (
          <button type="button" className="diagram-view__action" onClick={onCustomize} title={t('diagramView.customizeTitle')}>
            {t('diagramView.customize')}
          </button>
        )}
      </div>

      <div
        className="diagram-view"
        onMouseDown={history.claim}
        // Drives `.diagram-comment { font-size: var(...) }` so the text
        // size box affects every comment in this diagram. Multiplied by
        // zoom so comment text grows with the teeth.
        style={{ ['--diagram-comment-font-size' as string]: `${0.95 * commentTextScale * zoom}rem` }}
      >
        <div className={`diagram-view__toolbar${readOnly ? ' diagram-view__toolbar--readonly' : ''}`}>
          <div
            className="diagram-view__tool-group"
            role="group"
            aria-label={t('diagramView.toolGroup')}
          >
            <button
              type="button"
              className={`diagram-view__tool ${tool === 'mark' ? 'diagram-view__tool--active' : ''}`}
              onClick={() => setTool('mark')}
              aria-pressed={tool === 'mark'}
              title={
                markMode === 'missing-only'
                  ? t('diagramView.markMissingTitle')
                  : markMode === 'extracted-only'
                    ? t('diagramView.markExtractedTitle')
                    : t('diagramView.markTitle')
              }
            >
              <span className="diagram-view__long">{markMode === 'missing-only' ? t('diagramView.markMissing') : markMode === 'extracted-only' ? t('diagramView.markExtracted') : t('diagramView.mark')}</span>
              <span className="diagram-view__short">{t('diagramView.mark')}</span>
            </button>
            <button
              type="button"
              className={`diagram-view__tool ${tool === 'comment' ? 'diagram-view__tool--active' : ''}`}
              onClick={() => setTool('comment')}
              aria-pressed={tool === 'comment'}
            >
              {t('diagramView.comment')}
            </button>
            <button
              type="button"
              className={`diagram-view__tool ${tool === 'draw' ? 'diagram-view__tool--active' : ''}`}
              onClick={() => setTool('draw')}
              aria-pressed={tool === 'draw'}
            >
              {t('diagramView.draw')}
            </button>
          </div>

          <div
            className="diagram-view__history"
            role="group"
            aria-label={t('diagramView.historyGroup')}
          >
            <button
              type="button"
              className="diagram-view__action"
              onClick={history.undo}
              disabled={!history.canUndo}
              aria-label={t('diagramView.undo')}
              title={t('diagramView.undoTitle', { shortcut: IS_MAC ? '⌘Z' : 'Ctrl+Z' })}
            >
              {native ? <Icon name={ARROW_UTURN_BACKWARD_ICON} size={18} /> : '↶'}
            </button>
            <button
              type="button"
              className="diagram-view__action"
              onClick={history.redo}
              disabled={!history.canRedo}
              aria-label={t('diagramView.redo')}
              title={t('diagramView.redoTitle', { shortcut: IS_MAC ? '⌘⇧Z' : 'Ctrl+Y' })}
            >
              {native ? <Icon name={ARROW_UTURN_FORWARD_ICON} size={18} /> : '↷'}
            </button>
          </div>

          {/* Compact screens: everything below lives in this pop-over. On
              wider screens the wrapper is display: contents (inline, as before). */}
          <div className="diagram-view__more-wrap" ref={moreRef}>
          <button
            type="button"
            className={`diagram-view__action diagram-view__more${moreOpen ? ' diagram-view__more--open' : ''}`}
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            aria-haspopup="true"
            aria-label={t('diagramView.more')}
            title={t('diagramView.moreTitle')}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="3" cy="8" r="1.5" fill="currentColor" /><circle cx="8" cy="8" r="1.5" fill="currentColor" /><circle cx="13" cy="8" r="1.5" fill="currentColor" /></svg>
          </button>
          <div className={`diagram-view__extras${moreOpen ? ' diagram-view__extras--open' : ''}`}>
          <button type="button" className="diagram-view__action diagram-view__free-comment" onClick={() => { addFreeComment(); setMoreOpen(false); }}>
            {native ? <><Icon name={PLUS_ICON} size={15} /> {t('ios.diagram.freeComment')}</> : t('diagramView.freeComment')}
          </button>

          <button
            type="button"
            className={`diagram-view__tool diagram-view__numbers ${showNumbers ? 'diagram-view__tool--active' : ''}`}
            onClick={() => setShowNumbers(!showNumbers)}
            aria-pressed={showNumbers}
            title={t('diagramView.numbersTitle')}
          >
            {native ? t('ios.diagram.numbers') : t('diagramView.numbers')}
          </button>

          <div className="diagram-view__zoom" role="group" aria-label={t('diagramView.zoomGroup')}>
            <button
              type="button"
              className="diagram-view__action"
              onClick={() => zoomBy(1 / 1.25)}
              disabled={zoom <= ZOOM_MIN}
              aria-label={t('diagramView.zoomOut')}
              title={t('diagramView.zoomOut')}
            >
              {native ? <Icon name={MINUS_ICON} size={16} /> : '−'}
            </button>
            <button
              type="button"
              className="diagram-view__zoom-level"
              onClick={() => setZoom(1)}
              disabled={zoom === 1}
              title={t('diagramView.zoomReset')}
              aria-label={t('diagramView.zoomLevel', { percent: Math.round(zoom * 100) })}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className="diagram-view__action"
              onClick={() => zoomBy(1.25)}
              disabled={zoom >= ZOOM_MAX}
              aria-label={t('diagramView.zoomIn')}
              title={t('diagramView.zoomIn')}
            >
              {native ? <Icon name={PLUS_ICON} size={16} /> : '+'}
            </button>
          </div>

          {/* Text-size picker. Visible whenever the tool isn't Draw — i.e.
              Mark and Comment, since both modes work alongside comment
              boxes whose text size this controls. */}
          {tool !== 'draw' && (
            <div
              className="diagram-view__textsize"
              role="group"
              aria-label={t('diagramView.textSize.group')}
            >
              <span className="diagram-view__textsize-label" aria-hidden="true">{t('diagramView.textSize.glyph')}</span>
              {TEXT_SIZES.map((s) => (
                <button
                  type="button"
                  key={s.name}
                  className={`diagram-view__textsize-btn ${commentTextScale === s.value ? 'diagram-view__textsize-btn--active' : ''}`}
                  onClick={() => setCommentTextScale(s.value)}
                  aria-pressed={commentTextScale === s.value}
                  aria-label={t('diagramView.textSize.aria', { size: t(`diagramView.textSize.${s.name}`) })}
                  title={t('diagramView.textSize.title', { size: t(`diagramView.textSize.${s.name}`) })}
                >
                  {t(`diagramView.textSize.${s.name}`)}
                </button>
              ))}
            </div>
          )}

          {tool === 'draw' && (
            <div
              className="diagram-view__draw-controls"
              role="group"
              aria-label={t('diagramView.drawSettings')}
            >
              <div role="group" aria-label={t('diagramView.strokeColor')}>
                {STROKE_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c.value}
                    className={`diagram-view__color ${strokeColor === c.value ? 'diagram-view__color--active' : ''}`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setStrokeColor(c.value)}
                    aria-label={t('diagramView.strokeColorAria', { color: t(`diagramView.colors.${c.name}`) })}
                    aria-pressed={strokeColor === c.value}
                  />
                ))}
              </div>
              <label className="diagram-view__width-label">
                <span className="visually-hidden">{t('diagramView.strokeWidth')}</span>
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={0.5}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(parseFloat(e.target.value))}
                  className="diagram-view__width"
                  aria-label={t('diagramView.strokeWidth')}
                  aria-valuetext={t('diagramView.strokeWidthValue', { width: strokeWidth })}
                />
              </label>
              <button
                type="button"
                className="diagram-view__action diagram-view__action--danger"
                onClick={clearStrokes}
              >
                {t('diagramView.clearStrokes')}
              </button>
            </div>
          )}
          </div>
          </div>

        </div>

        <div
          className="diagram-view__canvas"
          style={{ ['--diagram-zoom' as string]: zoom }}
        >
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
          readOnly={readOnly}
          showNumbers={showNumbers}
        />
        </div>
      </div>
    </div>
  );
});

DiagramView.displayName = 'DiagramView';
