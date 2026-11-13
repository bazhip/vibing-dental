import React from 'react';
import { hapticSelection } from '../native/haptics';
import { Icon, type IconName } from './icons';

/**
 * iOS 26 tab bar: a floating glass capsule above the home indicator. Each
 * tab is an icon over a one-word label; the selected tab gets the filled
 * icon, the tint and a lighter pill behind it. Badges are red ovals.
 * Switching tabs plays the selection haptic. Tabs follow the ARIA tablist
 * pattern (arrow keys, Home/End).
 */

export interface TabItem {
  id: string;
  label: string;
  icon: IconName;
  badge?: number;
}

export interface TabBarProps {
  tabs: TabItem[];
  active: string;
  onChange(id: string): void;
  /** Accessible name of the tab list. */
  label?: string;
}

export function TabBar({ tabs, active, onChange, label }: TabBarProps) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const select = (id: string) => {
    if (id !== active) hapticSelection();
    onChange(id);
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
    select(tabs[next].id);
  };

  return (
    <nav className="ios-tabbar">
      <div className="ios-tabbar__capsule" role="tablist" aria-label={label}>
        {tabs.map((tab, i) => {
          const selected = tab.id === active;
          const badge = tab.badge && tab.badge > 0 ? (tab.badge > 99 ? '99+' : String(tab.badge)) : null;
          return (
            <button
              key={tab.id}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="tab"
              data-tab={tab.id}
              aria-selected={selected}
              aria-label={badge ? `${tab.label}, ${badge}` : undefined}
              tabIndex={selected ? 0 : -1}
              className={`ios-tabbar__tab${selected ? ' ios-tabbar__tab--selected' : ''}`}
              onClick={() => select(tab.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              <span className="ios-tabbar__icon">
                <Icon name={tab.icon} size={26} filled={selected} />
                {badge && <span className="ios-tabbar__badge" aria-hidden="true">{badge}</span>}
              </span>
              <span className="ios-tabbar__label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
