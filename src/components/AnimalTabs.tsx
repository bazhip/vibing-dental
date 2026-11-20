import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnimalTab } from '../hooks/useAnimalTabs';
import './AnimalTabs.css';
import { formatDate } from '../i18n/format';
import { visitTypeOf, type VisitType } from '../utils/visitTypes';

const COMPACT_DATE_STYLE = 'short';

interface Props {
  tabs: AnimalTab[];
  activeId: string;
  busy: boolean;
  showEmpty?: boolean;
  editing?: boolean;
  saveStatus?: 'saving' | 'saved' | 'notSaved';
  saveStatusTitle?: string;
  activeVisitType?: VisitType;
  visits?: { id: string; date: string; visitType?: VisitType }[];
  onVisit?: (id: string) => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}

export function AnimalTabs({ tabs, activeId, busy, onSelect, onClose, onAdd, showEmpty = true, editing = false, saveStatus, saveStatusTitle, activeVisitType, visits = [], onVisit }: Props) {
  const { t } = useTranslation('app');
  const visitLabel = (date: string, type?: VisitType) => [
    date ? formatDate(date) : t('topbar.undatedVisit'), t(`visitTypes.${visitTypeOf(type)}`),
  ].join(' · ');
  const strip = useRef<HTMLDivElement>(null);
  const add = useRef<HTMLButtonElement>(null);
  const [overflow, setOverflow] = useState({ before: false, after: false });
  const updateOverflow = () => {
    const list = strip.current;
    if (!list) return;
    const offset = Math.abs(list.scrollLeft);
    const next = { before: offset > 1, after: offset + list.clientWidth < list.scrollWidth - 1 };
    setOverflow(old => old.before === next.before && old.after === next.after ? old : next);
  };
  const scroll = (direction: number) => {
    const list = strip.current;
    if (!list) return;
    const rtl = getComputedStyle(list).direction === 'rtl';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const distance = Math.max(180, list.clientWidth - 44);
    list.scrollBy({ left: (rtl ? -direction : direction) * distance, behavior: reducedMotion ? 'instant' : 'smooth' });
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
    if (item) {
      const bounds = list.getBoundingClientRect();
      const tab = item.getBoundingClientRect();
      if (tab.right - tab.left > bounds.right - bounds.left) {
        const rtl = getComputedStyle(list).direction === 'rtl';
        list.scrollLeft += rtl ? tab.right - bounds.right : tab.left - bounds.left;
      } else if (tab.left < bounds.left) list.scrollLeft += tab.left - bounds.left;
      else if (tab.right > bounds.right) list.scrollLeft += tab.right - bounds.right;
    }
    updateOverflow();
  };
  // Overflow controls change the available width when they appear.
  const hasOverflow = overflow.before || overflow.after;
  useLayoutEffect(() => { revealSelected(); }, [activeId, tabs, hasOverflow, editing, saveStatus, visits.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const revealRef = useRef(revealSelected);
  revealRef.current = revealSelected;
  useEffect(() => {
    const reveal = () => revealRef.current();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reveal);
    const list = strip.current;
    if (!list) return;
    observer?.observe(list);
    const scrollWithWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey || event.deltaX || !event.deltaY || list.scrollWidth <= list.clientWidth) return;
      const before = list.scrollLeft;
      const units = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? list.clientWidth : 1;
      const direction = getComputedStyle(list).direction === 'rtl' ? -1 : 1;
      list.scrollLeft += event.deltaY * units * direction;
      if (list.scrollLeft !== before) event.preventDefault();
    };
    list.addEventListener('wheel', scrollWithWheel, { passive: false });
    window.addEventListener('resize', reveal);
    return () => {
      observer?.disconnect();
      list.removeEventListener('wheel', scrollWithWheel);
      window.removeEventListener('resize', reveal);
    };
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
          const compactDate = tab.date ? formatDate(tab.date, COMPACT_DATE_STYLE) : date;
          const type = tab.id === activeId ? activeVisitType ?? visits.find(visit => visit.id === activeId)?.visitType : undefined;
          const typeLabel = type ? t(`visitTypes.${type}`) : '';
          return <div className={`animal-tabs__item${tab.id === activeId ? ` animal-tabs__item--active${editing ? ' animal-tabs__item--editing' : ''}` : ''}`} key={tab.id}>
            <button type="button" className="animal-tabs__select" role="tab" id={`animal-tab-${tab.id}`}
              aria-controls="animal-chart-panel" aria-selected={tab.id === activeId}
              tabIndex={tab.id === activeId || !tabs.some(item => item.id === activeId) && index === 0 ? 0 : -1}
              disabled={busy} title={t('animalTabs.summary', { name, details: [pid, date, typeLabel].filter(Boolean).join(' · ') })}
              onClick={() => { restoreFocus.current = true; onSelect(tab.id); requestAnimationFrame(() => revealRef.current()); }} onKeyDown={event => move(event, index)}>
              <span className="animal-tabs__heading"><strong>{name}</strong>{tab.id === activeId && <span className="animal-tabs__indicators">
                {editing && <span className="animal-tabs__editing" title={t('topbar.editingTitle')}>{t('topbar.editingShort')}</span>}
                {saveStatus && <span className={`animal-tabs__save animal-tabs__save--${saveStatus}`} role="status" title={saveStatusTitle}>{t(`status.${saveStatus}`)}</span>}
              </span>}</span>
              <span className={`animal-tabs__details${typeLabel ? ' animal-tabs__details--typed' : ''}`}>
                {pid && <span className="animal-tabs__number">{pid}</span>}
                <span>
                  <span className="animal-tabs__date">{date}</span>
                  <span className="animal-tabs__date-compact">{compactDate}</span>
                </span>
                {typeLabel && <span className="animal-tabs__type">{typeLabel}</span>}
              </span>
            </button>
            {tab.id === activeId && visits.length > 1 && onVisit && <span className="animal-tabs__visit">
              <select className="select--bare" value={activeId} onChange={event => onVisit(event.target.value)} disabled={busy}
                aria-label={t('topbar.visitSwitchLabel', { n: visits.length })}>
                {!visits.some(visit => visit.id === activeId) && <option value={activeId}>{visitLabel(tab.date, type)}</option>}
                {visits.map(visit => <option key={visit.id} value={visit.id}>{visitLabel(visit.date, visit.visitType)}</option>)}
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
