import React from 'react';
import { hapticSelection } from '../native/haptics';
import './Form.css';

/**
 * Form rows for the chart's sections in the app (iOS Settings-style
 * forms): inset-grouped cards, label on the left and the control on the
 * right, stacked rows for long text, and a segmented control for short
 * single choices. They wrap the chart's existing inputs, so field
 * handlers, classes used elsewhere and accessible names stay the same.
 */

export function FormGroup({ header, footer, children, className }: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`ios-form__section${className ? ` ${className}` : ''}`}>
      {header && <h3 className="ios-form__header">{header}</h3>}
      <div className="ios-form__group">{children}</div>
      {footer && <div className="ios-form__footer">{footer}</div>}
    </section>
  );
}

/**
 * One row. Rendered as a <label> so tapping anywhere focuses the control,
 * unless `as="div"` (rows holding several controls, e.g. a segmented one).
 * `stacked` puts the label above (multi-line text).
 */
export function FormField({ label, children, stacked = false, as = 'label', className }: {
  label: React.ReactNode;
  children: React.ReactNode;
  stacked?: boolean;
  as?: 'label' | 'div';
  className?: string;
}) {
  const cls = `ios-field${stacked ? ' ios-field--stacked' : ''}${className ? ` ${className}` : ''}`;
  const inner = (
    <>
      <span className="ios-field__label">{label}</span>
      <span className="ios-field__control">{children}</span>
    </>
  );
  return as === 'label' ? <label className={cls}>{inner}</label> : <div className={cls}>{inner}</div>;
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** iOS segmented control (radio semantics). */
export function Segmented<T extends string>({ options, value, onChange, label, labelledBy }: {
  options: SegmentedOption<T>[];
  value: T;
  onChange(value: T): void;
  label?: string;
  labelledBy?: string;
}) {
  return (
    <span className="ios-segmented" role="radiogroup" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`ios-segmented__segment${o.value === value ? ' ios-segmented__segment--selected' : ''}`}
          onClick={() => {
            if (o.value !== value) hapticSelection();
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}
