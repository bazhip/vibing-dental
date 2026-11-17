import React from 'react';
import { useTranslation } from 'react-i18next';
import type { RecordNote } from '../../utils/recordNote';
import { copyRichText } from '../../utils/clipboard';
import { buildCopyContent, copyChartImage } from '../../utils/pims/clipboard';
import './CopyActions.css';

interface CopyActionsProps {
  note: RecordNote;
  storedText: string | null;
  renderImage?: () => Promise<string | null>;
  disabled?: boolean;
}

type CopyOutcome = 'rich' | 'plain' | 'prompt' | 'copied' | 'unavailable' | 'failed';
type Feedback = { content: ReturnType<typeof buildCopyContent>; outcome: CopyOutcome; label: string };

export const CopyActions: React.FC<CopyActionsProps> = ({ note, storedText, renderImage, disabled = false }) => {
  const { t } = useTranslation('pims');
  const headingId = React.useId();
  const content = React.useMemo(() => buildCopyContent(note, storedText), [note, storedText]);
  const [copying, setCopying] = React.useState(false);
  const [feedback, setFeedback] = React.useState<Feedback | null>(null);
  const inFlight = React.useRef(false);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const copy = async (label: string, action: () => Promise<CopyOutcome>) => {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setCopying(true);
    setFeedback(null);
    try {
      const outcome = await action();
      if (mounted.current) setFeedback({ content, outcome, label });
    } catch {
      if (mounted.current) setFeedback({ content, outcome: 'failed', label });
    } finally {
      inFlight.current = false;
      if (mounted.current) setCopying(false);
    }
  };

  const visibleFeedback = feedback?.content === content ? feedback : null;
  const failed = visibleFeedback?.outcome === 'failed' || visibleFeedback?.outcome === 'unavailable';
  const message = !visibleFeedback ? null
    : visibleFeedback.outcome === 'failed' ? t('copy.failed')
    : visibleFeedback.outcome === 'unavailable' ? t('copy.imageUnavailable')
    : visibleFeedback.outcome === 'prompt' ? t('copy.promptOpened')
    : visibleFeedback.outcome === 'plain' ? t('copy.plainCopied', { section: visibleFeedback.label })
    : t('copy.copied', { section: visibleFeedback.label });

  return (
    <section className="pims-copy" aria-labelledby={headingId} aria-busy={copying}>
      <h3 id={headingId} className="pims-copy__title">{t('copy.title')}</h3>
      <p className="pims-copy__hint">{t('copy.hint')}</p>
      <div className="pims-copy__actions">
        <button type="button" disabled={disabled || copying || !content.all.text.trim()}
          onClick={() => void copy(t('copy.allLabel'), () => copyRichText(content.all.html, content.all.text, t('copy.prompt')))}>
          {t('copy.all')}
        </button>
        {renderImage && (
          <button type="button" disabled={disabled || copying}
            onClick={() => void copy(t('rows.chart'), () => copyChartImage(renderImage))}>
            {t('copy.image')}
          </button>
        )}
      </div>
      {content.sections.length > 0 && (
        <details className="pims-copy__sections">
          <summary>{t('copy.sections')}</summary>
          <div className="pims-copy__actions">
            {content.sections.map((section) => (
              <button key={section.key} type="button" disabled={disabled || copying || !section.text.trim()}
                onClick={() => void copy(section.heading, () => copyRichText(section.html, section.text, t('copy.prompt')))}>
                {t('copy.section', { section: section.heading })}
              </button>
            ))}
          </div>
        </details>
      )}
      {message && <p className={failed ? 'pims-copy__error' : 'pims-copy__hint'} role={failed ? 'alert' : 'status'}>{message}</p>}
    </section>
  );
};
