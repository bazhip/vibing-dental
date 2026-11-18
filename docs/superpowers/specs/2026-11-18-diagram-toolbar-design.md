# Responsive diagram toolbar

Approved: expose Diagnosis and Procedure secondary controls inline when the diagram has space; retain More tools on narrow layouts. Reuse GitHub's grouped toolbar placement with this application's teal accents, neutral surfaces and existing translated labels. Keep 44px phone targets and existing locked-chart restrictions.

Approaches: reuse the existing controls with container queries (chosen: minimal layout change, no duplicate controls); duplicate desktop/mobile toolbars (rejected: duplicated state and focus targets); viewport-only breakpoint (rejected: ignores the codes panel and sidebar).

Wide: [Mark | Comment | Draw] [Undo Redo] [+ Comment] [Numbers] [Zoom] [Text size / draw settings]. Narrow: existing More tools disclosure. Use conservative wider thresholds for drawing and translated labels. No new copy or screens.
