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
import { polishRecordNote } from '../utils/recordNoteAi';
import { confirmDialog, friendlyError, toast } from './ui/dialogs';

interface RecordNotePanelProps {
  snapshot: ChartSnapshot;
  /** The edited / AI note on the chart (null = generated live). */
  stored: StoredRecordNote | null;
  onChange: (note: StoredRecordNote | null) => void;
  /** Saved chart not unlocked: copy only. */
  readOnly: boolean;
  aiEnabled: boolean;
}

/**
 * Documents → Record note: the chart as a clinical note to paste into the
 * practice's software. Generated from the chart until the vet edits it or
 * polishes it with AI; then the stored text is shown, with a notice when
 * the chart has changed since.
 */
export const RecordNotePanel: React.FC<RecordNotePanelProps> = ({
  snapshot, stored, onChange, readOnly, aiEnabled,
}) => {
  const { t, i18n } = useTranslation('media');
  const lng = i18n.language as AppLanguage;
  const [busy, setBusy] = React.useState(false);

  const note = React.useMemo(() => buildRecordNote(snapshot, recordNoteT(lng)), [snapshot, lng]);
  const basis = React.useMemo(() => recordNoteBasis(snapshot), [snapshot]);
  const text = stored?.text ?? recordNoteText(note);
  const stale = !!stored && stored.basedOn !== basis;

  // A fresh build (Polish) is based on the chart as it is now; a hand edit
  // keeps the basis it had, so editing a stale note doesn't hide that the
  // chart moved on since.
  const store = (value: string, source: StoredRecordNote['source']) =>
    onChange({ text: value, source, lng, basedOn: source === 'edited' && stored ? stored.basedOn : basis });

  const copy = async () => {
    const html = stored ? plainTextToHtml(stored.text) : recordNoteHtml(note);
    const outcome = await copyRichText(html, text, t('recordNote.copyPrompt'));
    if (outcome !== 'prompt') toast(t('recordNote.copied'), { kind: 'success' });
  };

  const polish = async () => {
    // Polish rewrites the note built from the chart (so it can't add facts),
    // which replaces anything typed into it — ask first.
    if (stored?.source === 'edited' && !(await confirmDialog({
      title: t('recordNote.polishReplace.title'),
      message: t('recordNote.polishReplace.message'),
      confirmLabel: t('recordNote.polishReplace.confirm'),
      danger: true,
    }))) return;
    setBusy(true);
    try {
      store(await polishRecordNote(snapshot, lng), 'ai');
    } catch (err) {
      toast(friendlyError(err, t('recordNote.aiFailed')), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pdf-preview-body record-note">
      <aside className="pdf-preview-styles">
        <ul className="pdf-preview-notes">
          <li>{t('recordNote.hint')}</li>
          {stored?.source === 'ai' && <li>{t('recordNote.aiBadge')}</li>}
        </ul>
        {readOnly && <p className="pdf-preview-hint" role="note">{t('recordNote.unlockHint')}</p>}
        {stale && (
          <p className="record-note__stale" role="status">{t('recordNote.stale')}</p>
        )}
        {aiEnabled && (
          <button type="button" className="pdf-preview-secondary" onClick={polish} disabled={readOnly || busy}>
            {busy ? t('recordNote.polishing') : t('recordNote.polish')}
          </button>
        )}
        {stored && (
          <button type="button" className="pdf-preview-secondary" onClick={() => onChange(null)} disabled={readOnly || busy}>
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
        readOnly={readOnly || busy}
        spellCheck
        onChange={(e) => store(e.target.value, 'edited')}
      />
    </div>
  );
};
