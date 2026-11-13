import React from 'react';
import { useTranslation } from 'react-i18next';
import { NavBar } from '../NavBar';
import { Icon, type IconName } from '../icons';
import { MenuPopover, type MenuAnchor, type MenuItem } from '../ContextMenu';
import { ScrollContainerContext } from '../scrollContainer';
import './chart.css';

/**
 * The Chart tab's navigation bar: the patient's name as a large title
 * (tap it to jump between sections), the save status as the subtitle,
 * and the trailing items — Edit / Done for saved visits, Share (opens
 * Documents through the chart form's submit) and a More menu.
 *
 * The leading slot stays empty: on iPad the Show-sidebar button floats
 * there at the root of every tab.
 */

const SHARE_ICON: IconName = 'square-and-arrow-up';
const MORE_ICON: IconName = 'ellipsis-circle';
const NOTICE_ICON: IconName = 'exclamationmark-circle';

export interface ChartNavBarProps {
  title: string;
  subtitle: string;
  sections: { id: string; label: string }[];
  activeSection: string;
  onSection(id: string): void;
  /** Accessible name of Share (what it previews and downloads). */
  shareLabel: string;
  /** More menu; no button when empty. */
  menu: MenuItem[];
  /** View-only saved visit: Edit unlocks it (same as Edit chart). */
  onEdit?: () => void;
  /** Editing a saved visit: Done saves and locks it again. */
  onDone?: () => void;
}

export function ChartNavBar({ title, subtitle, sections, activeSection, onSection, shareLabel, menu, onEdit, onDone }: ChartNavBarProps) {
  const { t } = useTranslation(['chart', 'common']);
  const [moreAnchor, setMoreAnchor] = React.useState<MenuAnchor | null>(null);
  const scroller = React.useContext(ScrollContainerContext);
  // Publish the bar's height as --topbar-height (px), like the website's
  // topbar does: the grid's floating header and other pinned parts read
  // it to sit just under the bar.
  const wrapRef = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const bar = wrapRef.current?.querySelector<HTMLElement>('.ios-navbar');
    if (!bar) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--topbar-height', `${Math.round(bar.getBoundingClientRect().height)}px`);
    publish();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null;
    ro?.observe(bar);
    return () => {
      ro?.disconnect();
      root.style.removeProperty('--topbar-height');
    };
  }, []);

  const titleMenu = sections.map((s) => ({
    label: s.label,
    checked: s.id === activeSection,
    onSelect: () => {
      onSection(s.id);
      // A chosen section starts at its top.
      const el = scroller?.current;
      if (el) {
        if (typeof el.scrollTo === 'function') el.scrollTo({ top: 0 });
        else el.scrollTop = 0;
      }
    },
  }));

  const trailing = (
    <>
      {onEdit && (
        <button type="button" className="ios-glass-button ios-glass-button--tint" onClick={onEdit}>
          {t('common:actions.edit')}
        </button>
      )}
      {onDone && (
        <button type="button" className="ios-glass-button ios-glass-button--prominent" onClick={onDone}>
          {t('common:actions.done')}
        </button>
      )}
      <span className="ios-glass-group">
        <button
          type="submit"
          form="chart-form"
          className="ios-glass-button ios-glass-button--icon ios-glass-button--tint"
          aria-haspopup="dialog"
          aria-label={shareLabel}
        >
          <Icon name={SHARE_ICON} size={22} />
        </button>
        {menu.length > 0 && (
          <button
            type="button"
            className="ios-glass-button ios-glass-button--icon ios-glass-button--tint"
            aria-label={t('ios.more')}
            aria-haspopup="menu"
            aria-expanded={moreAnchor ? true : false}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMoreAnchor({ left: r.left, top: r.top, width: r.width, height: r.height });
            }}
          >
            <Icon name={MORE_ICON} size={22} />
          </button>
        )}
      </span>
    </>
  );

  return (
    <div className="ios-chart-bar" ref={wrapRef}>
      <NavBar largeTitle title={title} subtitle={subtitle || undefined} titleMenu={titleMenu} trailing={trailing} />
      {moreAnchor && (
        <MenuPopover items={menu} anchor={moreAnchor} label={t('ios.more')} onClose={() => setMoreAnchor(null)} />
      )}
    </div>
  );
}

export interface ChartNoticeProps {
  tone: 'warning' | 'error';
  text: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Inline banner-style notice under the bar (in the flow, never over it). */
export function ChartNotice({ tone, text, detail, actionLabel, onAction }: ChartNoticeProps) {
  return (
    <div className={`ios-chart-notice ios-chart-notice--${tone}`} role="alert">
      <Icon name={NOTICE_ICON} size={20} className="ios-chart-notice__icon" />
      <span className="ios-chart-notice__text">
        <span className="ios-chart-notice__title">{text}</span>
        {detail && <span className="ios-chart-notice__detail">{detail}</span>}
      </span>
      {actionLabel && onAction && (
        <button type="button" className="ios-chart-notice__action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
