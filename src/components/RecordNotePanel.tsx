import { RefineTextAction } from './RefineTextAction';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AppLanguage } from '../i18n/config';
import type { ChartSnapshot, StoredRecordNote } from '../types';
import {
  buildRecordNote,
  plainTextToHtml,
  recordNoteBasis,
  recordNoteHtml,
  recordNoteT,
  recordNoteText,
} from '../utils/recordNote';
import { copyRichText } from '../utils/clipboard';
import { usePimsExtension } from '../hooks/usePimsExtension';
import { toast } from './ui/dialogs';
import type { ChartSnapshot as PreviewSnapshot } from './PdfPreviewModal';
import { SendToEzyvetDialog } from './SendToEzyvetDialog';


/** Send to ezyVet (Chrome extension). Omitted = no button. */
export interface RecordNotePims {
  aiEnabled?: boolean;
  /** The practice has Send to ezyVet on. */
  enabled: boolean;
  /** Cloud chart id, to record when it was sent (null = not saved to the cloud). */
  chartId: string | null;
  patientName: string;
  /** The chart's patient number ('' = none). */
  patientNumber: string;
  /** Last sent (null = unknown; the dialog looks it up). */
  sentAt: string | null;
}

interface RecordNotePanelProps {
  snapshot: ChartSnapshot;
  /** The edited / AI note on the chart (null = generated live). */
  stored: StoredRecordNote | null;
  onChange: (note: StoredRecordNote | null) => void;
  /** Saved chart not unlocked: copy only. */
  readOnly: boolean;
  pims?: RecordNotePims;
  /** Live diagrams, for the chart picture sent to ezyVet. */
  chartSnapshot?: PreviewSnapshot | null;
}

/**
 * Documents → Record note: the chart as a clinical note to paste into the
 * practice's software. Generated from the chart until the vet edits it;
 * then the stored text is shown, with a notice when
 * the chart has changed since.
 */
export const RecordNotePanel: React.FC<RecordNotePanelProps> = ({
  snapshot, stored, onChange, readOnly, pims, chartSnapshot = null,
}) => {
  const { t, i18n } = useTranslation('media');
  const lng = i18n.language as AppLanguage;

  const note = React.useMemo(() => buildRecordNote(snapshot, recordNoteT(lng)), [snapshot, lng]);
  const basis = React.useMemo(() => recordNoteBasis(snapshot), [snapshot]);
  const text = stored?.text ?? recordNoteText(note);
  const stale = !!stored && stored.basedOn !== basis;

  // A hand edit keeps the basis the note had, so editing a stale note
  // doesn't hide that the chart moved on since.
  const edit = (value: string) =>
    onChange({ text: value, source: 'edited', lng, basedOn: stored ? stored.basedOn : basis });

  // Desktop Chrome with the extension's bridge, never the iOS app.
  const canSend = usePimsExtension(!!pims?.enabled);
  const [sendOpen, setSendOpen] = React.useState(false);
  const [sentAt, setSentAt] = React.useState<string | null>(null);
  // An edited note is split on its headings in the language it was written in.
  const sendNote = React.useMemo(
    () => (stored && stored.lng !== lng ? buildRecordNote(snapshot, recordNoteT(stored.lng)) : note),
    [stored, lng, snapshot, note],
  );

  const copy = async () => {
    const html = stored ? plainTextToHtml(stored.text) : recordNoteHtml(note);
    const outcome = await copyRichText(html, text, t('recordNote.copyPrompt'));
    if (outcome !== 'prompt') toast(t('recordNote.copied'), { kind: 'success' });
  };

  return (
    <div className="pdf-preview-body record-note">
      <aside className="pdf-preview-styles">
        <ul className="pdf-preview-notes">
          <li>{t('recordNote.hint')}</li>
        </ul>
        {readOnly && <p className="pdf-preview-hint" role="note">{t('recordNote.unlockHint')}</p>}
        {stale && (
          <p className="record-note__stale" role="status">{t('recordNote.stale')}</p>
        )}
        {stored && (
          <button type="button" className="pdf-preview-secondary" onClick={() => onChange(null)} disabled={readOnly}>
            {t('recordNote.rebuild')}
          </button>
        )}
        <button type="button" className="pdf-preview-download" onClick={copy}>
          {t('recordNote.copy')}
        </button>
        {canSend && pims && (
          <button type="button" className="pdf-preview-secondary" onClick={() => setSendOpen(true)}>
            {t('dialog.open', { ns: 'pims' })}
          </button>
        )}
      </aside>
      {canSend && pims && sendOpen && (
        <SendToEzyvetDialog
          open
          aiEnabled={pims.aiEnabled}
          onClose={() => setSendOpen(false)}
          note={sendNote}
          stored={stored}
          chartSnapshot={chartSnapshot}
          chartId={pims.chartId}
          patientName={pims.patientName}
          patientNumber={pims.patientNumber}
          sentAt={sentAt ?? pims.sentAt}
          onSent={setSentAt}
        />
      )}
      <div className="refine-field">
        <textarea
          className="record-note__text"
          aria-label={t('recordNote.title')}
          value={text}
          readOnly={readOnly}
          spellCheck
          onChange={(e) => edit(e.target.value)}
        />
          <RefineTextAction value={text} onApply={edit} readOnly={readOnly} />
      </div>
    </div>
  );
};
