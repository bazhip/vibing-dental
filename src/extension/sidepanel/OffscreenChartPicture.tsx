import React from 'react';
import { useTranslation } from 'react-i18next';
import { ToothDiagram, type ToothDiagramHandle } from '../../components/ToothDiagram';
import { renderChartPicture } from '../../utils/pims/chartPicture';
import type { ChartSnapshot, ToothMarks } from '../../types';

const noop = () => {};

/** Parked far off-screen, not display:none, so the SVGs lay out and measure. */
const OFFSCREEN_STYLE: React.CSSProperties = {
  position: 'fixed',
  left: '-10000px',
  top: 0,
  width: 1200,
  pointerEvents: 'none',
};

export interface OffscreenChartPictureApi {
  /** Mount this once; it renders the two diagrams off-screen. */
  element: React.ReactElement;
  /** The pre/post chart as one PNG data URL; null while a diagram is not mounted. */
  render: () => Promise<string | null>;
  /**
   * True once both diagrams are mounted. Every chart has drawable diagrams
   * (the tooth outlines) and the PDF always includes both, even when nothing
   * is marked, so an empty chart still has a picture. Pass this as
   * `hasChartPicture` to usePimsSend so the picture callback never returns
   * null for a chart row that targets a field.
   */
  hasDiagrams: boolean;
}

/** Same effective post-op marks as AdminChartViewer: pre-op missing teeth stay missing. */
function effectivePostMarks(snap: ChartSnapshot): ToothMarks {
  const marks: ToothMarks = { ...snap.postMarks };
  for (const [k, m] of Object.entries(snap.preMarks)) if (m === 'missing') marks[Number(k)] = 'missing';
  return marks;
}

export function useOffscreenChartPicture(snapshot: ChartSnapshot | null): OffscreenChartPictureApi {
  const { t } = useTranslation('pims');
  const preRef = React.useRef<ToothDiagramHandle>(null);
  const postRef = React.useRef<ToothDiagramHandle>(null);
  const [hasDiagrams, setHasDiagrams] = React.useState(false);

  React.useLayoutEffect(() => {
    setHasDiagrams(!!snapshot && !!preRef.current?.getSvgElement() && !!postRef.current?.getSvgElement());
  }, [snapshot]);

  const render = React.useCallback(async (): Promise<string | null> => {
    if (!snapshot) return null;
    const preSvg = preRef.current?.getSvgElement();
    const postSvg = postRef.current?.getSvgElement();
    if (!preSvg || !postSvg) return null;
    return renderChartPicture(
      {
        species: snapshot.species,
        preSvg,
        postSvg,
        preComments: preRef.current?.getCommentExports() ?? [],
        postComments: postRef.current?.getCommentExports() ?? [],
      },
      { pre: t('picture.pre'), post: t('picture.post') },
    );
  }, [snapshot, t]);

  const element = (
    <div aria-hidden="true" style={OFFSCREEN_STYLE} data-testid="offscreen-chart-picture">
      {snapshot && (
        <>
          <ToothDiagram
            ref={preRef}
            species={snapshot.species}
            toothMarks={snapshot.preMarks}
            onToothMarksChange={noop}
            comments={snapshot.preComments}
            onCommentsChange={noop}
            strokes={snapshot.preStrokes}
            onStrokesChange={noop}
            tool="mark"
            strokeColor="#000"
            strokeWidth={2}
            readOnly
            showNumbers={false}
          />
          <ToothDiagram
            ref={postRef}
            species={snapshot.species}
            toothMarks={effectivePostMarks(snapshot)}
            onToothMarksChange={noop}
            comments={snapshot.postComments}
            onCommentsChange={noop}
            strokes={snapshot.postStrokes}
            onStrokesChange={noop}
            tool="mark"
            strokeColor="#000"
            strokeWidth={2}
            readOnly
            showNumbers={false}
          />
        </>
      )}
    </div>
  );

  return { element, render, hasDiagrams };
}
