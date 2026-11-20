import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dailyMedSource, findDailyMedProducts, loadDailyMedLabel, type DailyMedProduct } from '../utils/dailyMed';
import { medicationLookupUrl } from '../utils/consultationMedicationHistory';

type Label = Awaited<ReturnType<typeof loadDailyMedLabel>>;

export function DrugReferenceLookup({ selectedName }: { selectedName?: string }) {
  const { t } = useTranslation('visitDocumentation');
  const id = useId();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<DailyMedProduct[]>();
  const [selected, setSelected] = useState<DailyMedProduct>();
  const [label, setLabel] = useState<Label>();
  const [status, setStatus] = useState<'idle' | 'searching' | 'loading' | 'searchError' | 'labelError'>('idle');
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  const setName = (name: string) => {
    inFlight.current?.abort();
    setQuery(name);
    setProducts(undefined);
    setSelected(undefined);
    setLabel(undefined);
    setStatus('idle');
  };
  const startRequest = () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    return controller.signal;
  };
  const search = async () => {
    if (!query.trim()) return;
    const signal = startRequest();
    setProducts(undefined);
    setSelected(undefined);
    setLabel(undefined);
    setStatus('searching');
    try {
      const results = await findDailyMedProducts(query.trim(), signal);
      if (signal.aborted) return;
      setProducts(results);
      setStatus('idle');
    } catch {
      if (!signal.aborted) setStatus('searchError');
    }
  };
  const openLabel = async (product: DailyMedProduct) => {
    const signal = startRequest();
    setSelected(product);
    setLabel(undefined);
    setStatus('loading');
    try {
      const result = await loadDailyMedLabel(product.id, signal);
      if (signal.aborted) return;
      setLabel(result);
      setStatus('idle');
    } catch {
      if (!signal.aborted) setStatus('labelError');
    }
  };

  return <details className="visit-documentation__transcripts drug-reference">
    <summary>{t('consultation.medications.lookup')}</summary>
    <label className="patient-form__label" htmlFor={id}>{t('consultation.medications.drugName')}</label>
    <div className="visit-documentation__lookup">
      <input className="patient-form__input" id={id} value={query} maxLength={100} autoComplete="off"
        onChange={event => setName(event.target.value)}
        onKeyDown={event => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          if (status !== 'searching') void search();
        }} />
      <button className="diagram-view__action" type="button" onClick={() => void search()}
        disabled={!query.trim() || status === 'searching'}>{t('consultation.medications.search')}</button>
    </div>
    {selectedName && <button className="diagram-view__action" type="button"
      onClick={() => setName(selectedName)}>{t('consultation.medications.useSelection')}</button>}
    <p className="visit-documentation__helper">{t('consultation.medications.labelScope')}</p>
    {status === 'searching' && <p role="status">{t('consultation.medications.searching')}</p>}
    {status === 'searchError' && <p role="alert">{t('consultation.medications.searchError')}</p>}
    {products?.length === 0 && <p role="status">{t('consultation.medications.noProducts')}</p>}
    {products && products.length > 0 && <ul className="drug-reference__results" aria-label={t('consultation.medications.results')}>
      {products.map(product => <li key={product.id}>
        <button type="button" aria-pressed={selected?.id === product.id} className="diagram-view__action"
          onClick={() => { if (selected?.id !== product.id || status === 'labelError') void openLabel(product); }}>{product.title}</button>
      </li>)}
    </ul>}
    {(status === 'searchError' || products?.length === 0) && <a href={medicationLookupUrl(query)} target="_blank"
      rel="noopener noreferrer" className="diagram-view__action">{t('consultation.medications.externalSearch')}</a>}
    {selected && <section className="drug-reference__label" aria-label={selected.title}>
      <h3>{selected.title}</h3>
      <a href={dailyMedSource(selected.id)} target="_blank" rel="noopener noreferrer"
        className="diagram-view__action">{t('consultation.medications.fullLabel')}</a>
      {status === 'loading' && <p role="status">{t('consultation.medications.loadingLabel')}</p>}
      {status === 'labelError' && <p role="alert">{t('consultation.medications.labelError')}</p>}
      {label?.strengths.length ? <p><strong>{t('consultation.medications.strengths')}</strong> {label.strengths.join(' · ')}</p> : null}
      {label?.sections.map((section, index) => <details className="visit-documentation__transcripts" key={`${section.title}-${index}`}>
        <summary>{section.title}</summary>
        {section.text ? <p>{section.text}</p>
          : <a href={dailyMedSource(selected.id)} target="_blank" rel="noopener noreferrer">{t('consultation.medications.complexSection')}</a>}
      </details>)}
      {label?.sections.length === 0 && <p>{t('consultation.medications.noSections')}</p>}
    </section>}
  </details>;
}
