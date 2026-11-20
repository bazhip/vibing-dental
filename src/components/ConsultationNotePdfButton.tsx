import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isNativeApp } from '../native/platform';
import { saveChartPdf } from '../native/saveFile';
import { savePdf } from '../utils/savePdf';
import { renderClinicalTextPdf } from '../utils/textPdf';
import { friendlyError, toast } from './ui/dialogs';

interface Props {
  text: string;
  language: string;
  className?: string;
}

type Preparation =
  | { key: string; blob: Blob }
  | { key: string; error: unknown };

export function ConsultationNotePdfButton({ text, language, className = 'pdf-preview-download' }: Props) {
  const { t } = useTranslation(['pdfui', 'visitDocumentation', 'app']);
  const title = t('visitDocumentation:consultation.title', { lng: language });
  const key = JSON.stringify([language, title, text]);
  const [prepared, setPrepared] = useState<Preparation | null>(null);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const ready = prepared?.key === key ? prepared : null;
  const empty = !text.trim();

  useEffect(() => {
    if (empty) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void renderClinicalTextPdf(text, title, language).then(bytes => {
        if (active) setPrepared({ key, blob: new Blob([bytes], { type: 'application/pdf' }) });
      }).catch((error: unknown) => {
        if (active) setPrepared({ key, error });
      });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [empty, key, language, text, title]);

  const exportError = (error: unknown) => {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    return friendlyError(error, t(code === 'font' ? 'app:radiologyReport.pdfFont'
      : code === 'limit' ? 'app:radiologyReport.pdfLimit'
        : code === 'unsupported' ? 'app:radiologyReport.pdfUnsupported' : 'app:radiologyReport.exportFailed'));
  };
  const download = async () => {
    if (!ready || !('blob' in ready) || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    const filename = `${title.replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
    try {
      if (isNativeApp()) await saveChartPdf(ready.blob, filename);
      else if (await savePdf(ready.blob, filename) === 'unsupported') throw { code: 'unsupported' };
    } catch (error) {
      toast(exportError(error), { kind: 'error' });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  return <>
    <button type="button" className={className} disabled={!ready || 'error' in ready || saving}
      aria-busy={!empty && (!ready || saving)} onClick={() => void download()}>
      {t('preview.download')}
    </button>
    {ready && 'error' in ready && <p role="alert" className="pdf-preview-hint">{exportError(ready.error)}</p>}
  </>;
}
