import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnimalTab } from '../hooks/useAnimalTabs';
import './AnimalTabs.css';
import { formatDate } from '../i18n/format';

interface Props {
  tabs: AnimalTab[];
  activeId: string;
  busy: boolean;
  showEmpty?: boolean;
  editing?: boolean;
  visits?: { id: string; date: string }[];
  onVisit?: (id: string) => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}

export function AnimalTabs({ tabs, activeId, busy, onSelect, onClose, onAdd, showEmpty = true, editing = false, visits = [], onVisit }: Props) {
  const { t } = useTranslation('app');
  const strip = useRef<HTMLDivElement>(null);
  const add = useRef<HTMLButtonElement>(null);
  const [overflow, setOverflow] = useState({ before: false, after: false });
  const updateOverflow = () => {
    const list = strip.current;
    if (!list) return;
    const next = { before: list.scrollLeft > 1, after: list.scrollLeft + list.clientWidth < list.scrollWidth - 1 };
    setOverflow(old => old.before === next.before && old.after === next.after ? old : next);
  };
  const scroll = (direction: number) => {
    const list = strip.current;
    if (list) { list.scrollLeft += direction * Math.max(180, list.clientWidth - 44); updateOverflow(); }
  };
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!busy && restoreFocus.current) {
      restoreFocus.current = false;
      const selected = strip.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
      (selected ?? add.current)?.focus({ preventScroll: true });
    }
  }, [tabs, busy]);
  const revealSelected = () => {
    const list = strip.current;
    const item = list?.querySelector<HTMLElement>('[aria-selected="true"]')?.closest<HTMLElement>('.animal-tabs__item');
    if (!list) return;
    if (list.clientWidth > 0) list.style.setProperty('--animal-tab-available', `${list.clientWidth}px`);
    if (item) {
      const bounds = list.getBoundingClientRect();
      const tab = item.getBoundingClientRect();
      if (tab.left < bounds.left) list.scrollLeft += tab.left - bounds.left;
      else if (tab.right > bounds.right) list.scrollLeft += tab.right - bounds.right;
    }
    updateOverflow();
  };
  // Overflow controls change the available width after the first measurement.
  const hasOverflow = overflow.before || overflow.after;
  useLayoutEffect(() => { revealSelected(); }, [activeId, tabs, hasOverflow, editing, visits.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const revealRef = useRef(revealSelected);
  revealRef.current = revealSelected;
  useEffect(() => {
    const reveal = () => revealRef.current();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reveal);
    if (strip.current) observer?.observe(strip.current);
    window.addEventListener('resize', reveal);
    return () => { observer?.disconnect(); window.removeEventListener('resize', reveal); };
  }, []);
  const move = (event: React.KeyboardEvent, index: number) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0 || busy) return;
    event.preventDefault();
    (strip.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next])?.focus({ preventScroll: true });
    restoreFocus.current = true;
    onSelect(tabs[next].id);
  };
  return <>
    <div className="animal-tabs" aria-busy={busy}>
      {(overflow.before || overflow.after) && <button type="button" className="animal-tabs__scroll" aria-label={t('animalTabs.previous')} disabled={busy || !overflow.before} onClick={() => scroll(-1)}>‹</button>}
      <div className="animal-tabs__list" role="tablist" aria-label={t('animalTabs.label')} ref={strip} onScroll={updateOverflow}>
        {tabs.map((tab, index) => {
          const name = tab.name || t('animalTabs.unnamed');
          const pid = tab.patientNumber;
          const date = tab.date ? formatDate(tab.date) : t('topbar.undatedVisit');
          return <div className={`animal-tabs__item${tab.id === activeId ? ` animal-tabs__item--active${editing ? ' animal-tabs__item--editing' : ''}` : ''}`} key={tab.id}>
            <button type="button" className="animal-tabs__select" role="tab" id={`animal-tab-${tab.id}`}
              aria-controls="animal-chart-panel" aria-selected={tab.id === activeId}
              tabIndex={tab.id === activeId || !tabs.some(item => item.id === activeId) && index === 0 ? 0 : -1}
              disabled={busy} title={t('animalTabs.summary', { name, details: [pid, date].filter(Boolean).join(' · ') })}
              onClick={() => { restoreFocus.current = true; onSelect(tab.id); requestAnimationFrame(() => revealRef.current()); }} onKeyDown={event => move(event, index)}>
              <span className="animal-tabs__heading"><strong>{name}</strong>{editing && tab.id === activeId && <span className="animal-tabs__editing" title={t('topbar.editingTitle')}>{t('topbar.editingShort')}</span>}</span><span className="animal-tabs__details">{pid && <span>{pid}</span>}<span>{date}</span></span>
            </button>
            {tab.id === activeId && visits.length > 1 && onVisit && <span className="animal-tabs__visit">
              <select className="select--bare" value={activeId} onChange={event => onVisit(event.target.value)} disabled={busy}
                aria-label={t('topbar.visitSwitchLabel', { n: visits.length })}>
                {!visits.some(visit => visit.id === activeId) && <option value={activeId}>{date}</option>}
                {visits.map(visit => <option key={visit.id} value={visit.id}>{visit.date ? formatDate(visit.date) : t('topbar.undatedVisit')}</option>)}
              </select>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            </span>}
            <button type="button" className="animal-tabs__close" disabled={busy}
              aria-label={t('animalTabs.close', { name })} title={t('animalTabs.closeHint')}
              onClick={() => { restoreFocus.current = true; onClose(tab.id); }}>×</button>
          </div>;
        })}
      </div>
      {(overflow.before || overflow.after) && <button type="button" className="animal-tabs__scroll" aria-label={t('animalTabs.next')} disabled={busy || !overflow.after} onClick={() => scroll(1)}>›</button>}
      <button type="button" className="animal-tabs__add" data-tour="library" ref={add} disabled={busy} onClick={onAdd}
        aria-label={t('animalTabs.add')} title={t('animalTabs.add')}>+</button>
    </div>
    {showEmpty && tabs.length === 0 && <div className="animal-tabs__empty">
      <h2>{t('animalTabs.emptyTitle')}</h2><p>{t('animalTabs.emptyBody')}</p>
      <button type="button" className="animal-tabs__open" onClick={onAdd} disabled={busy}>{t('animalTabs.open')}</button>
    </div>}
  </>;
}
