import React from 'react';
import { hapticSelection } from '../native/haptics';
import { Icon, ICON_NAMES, type IconName } from './icons';

/**
 * Inset-grouped lists (Settings-style): rounded cell groups on the grouped
 * background, footnote headers and footers, separators inset past the
 * icon, 44pt minimum rows.
 */

const CHEVRON_ICON: IconName = 'chevron-right';
const CHECK_ICON: IconName = 'checkmark';

/** Set by SwipeRow so its ListRow child doesn't add a second listitem. */
export const RowWrapperContext = React.createContext(false);

export function List({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`ios-list${className ? ` ${className}` : ''}`}>{children}</div>;
}

export interface ListSectionProps {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function ListSection({ header, footer, children }: ListSectionProps) {
  const headerId = React.useId();
  return (
    <section className="ios-list__section">
      {header && (
        <h2 id={headerId} className="ios-list__header">
          {header}
        </h2>
      )}
      <div role="list" className="ios-list__group" aria-labelledby={header ? headerId : undefined}>
        {children}
      </div>
      {footer && <div className="ios-list__footer">{footer}</div>}
    </section>
  );
}

function isIconName(v: unknown): v is IconName {
  return typeof v === 'string' && (ICON_NAMES as readonly string[]).includes(v);
}

export interface ListRowProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Trailing secondary text (current value). */
  value?: React.ReactNode;
  /** An icon name (drawn in the tint) or any node. */
  icon?: IconName | React.ReactNode;
  /** 'chevron' = pushes a screen; 'check' = the selected choice. */
  accessory?: 'chevron' | 'check' | React.ReactNode;
  destructive?: boolean;
  onClick?: () => void;
}

export function ListRow({ title, subtitle, value, icon, accessory, destructive, onClick }: ListRowProps) {
  const wrapped = React.useContext(RowWrapperContext);
  const cls = `ios-row${destructive ? ' ios-row--destructive' : ''}${onClick ? ' ios-row--button' : ''}${icon ? ' ios-row--with-icon' : ''}`;
  const inner = (
    <>
      {icon && <span className="ios-row__icon">{isIconName(icon) ? <Icon name={icon} size={22} /> : icon}</span>}
      <span className="ios-row__main">
        <span className="ios-row__text">
          <span className="ios-row__title">{title}</span>
          {subtitle && <span className="ios-row__subtitle">{subtitle}</span>}
        </span>
        {value !== undefined && value !== null && <span className="ios-row__value">{value}</span>}
        {accessory === 'chevron' ? (
          <Icon name={CHEVRON_ICON} size={14} className="ios-row__chevron" />
        ) : accessory === 'check' ? (
          <Icon name={CHECK_ICON} size={17} className="ios-row__check" />
        ) : (
          accessory
        )}
      </span>
    </>
  );
  const row = onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-pressed={accessory === 'check' ? true : undefined}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
  return wrapped ? row : <div role="listitem" className="ios-list__item">{row}</div>;
}

export interface SwitchRowProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
}

export function SwitchRow({ title, subtitle, checked, onChange, disabled }: SwitchRowProps) {
  const id = React.useId();
  return (
    <div role="listitem" className="ios-list__item">
      <label className={`ios-row ios-row--switch${disabled ? ' ios-row--disabled' : ''}`} htmlFor={`${id}-sw`}>
        <span className="ios-row__main">
          <span className="ios-row__text">
            <span id={`${id}-t`} className="ios-row__title">{title}</span>
            {subtitle && <span id={`${id}-s`} className="ios-row__subtitle">{subtitle}</span>}
          </span>
          <input
            id={`${id}-sw`}
            type="checkbox"
            role="switch"
            className="ios-switch"
            checked={checked}
            disabled={disabled}
            aria-labelledby={`${id}-t`}
            aria-describedby={subtitle ? `${id}-s` : undefined}
            onChange={(e) => {
              hapticSelection();
              onChange(e.target.checked);
            }}
          />
        </span>
      </label>
    </div>
  );
}
