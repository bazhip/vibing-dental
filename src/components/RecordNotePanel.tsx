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
import { toast } from './ui/dialogs';

interface RecordNotePanelProps {
  snapshot: ChartSnapshot;
  /** The edited / AI note on the chart (null = generated live). */
  stored: StoredRecordNote | null;
  onChange: (note: StoredRecordNote | null) => void;
  /** Saved chart not unlocked: copy only. */
  readOnly: boolean;
}

/**
 * Documents → Record note: the chart as a clinical note to paste into the
 * practice's software. Generated from the chart until the vet edits it;
 * then the stored text is shown, with a notice when
 * the chart has changed since.
 */
export const RecordNotePanel: React.FC<RecordNotePanelProps> = ({
  snapshot, stored, onChange, readOnly,
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
      </aside>
      <textarea
        className="record-note__text"
        aria-label={t('recordNote.title')}
        value={text}
        readOnly={readOnly}
        spellCheck
        onChange={(e) => edit(e.target.value)}
      />
    </div>
  );
};
