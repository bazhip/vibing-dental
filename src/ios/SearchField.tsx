import React from 'react';
import { Icon, type IconName } from './icons';

/**
 * iOS search field (UISearchBar, as integrated under a large title): a
 * rounded fill with a magnifying glass, the placeholder, and a clear
 * button once there is text. Escape clears it.
 */

const SEARCH_ICON: IconName = 'magnifyingglass';
const CLEAR_ICON: IconName = 'xmark';

export interface SearchFieldProps {
  value: string;
  onChange(value: string): void;
  placeholder: string;
  /** Accessible name (the placeholder is not a label). */
  label: string;
  /** Accessible name of the clear button. */
  clearLabel: string;
}

export function SearchField({ value, onChange, placeholder, label, clearLabel }: SearchFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <div className="ios-searchfield" role="search">
      <Icon name={SEARCH_ICON} size={17} className="ios-searchfield__icon" />
      <input
        ref={inputRef}
        type="search"
        className="ios-searchfield__input"
        enterKeyHint="search"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
          // Return dismisses the keyboard (the search already ran).
          if (e.key === 'Enter') inputRef.current?.blur();
        }}
      />
      {value && (
        <button
          type="button"
          className="ios-searchfield__clear"
          aria-label={clearLabel}
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
        >
          <Icon name={CLEAR_ICON} size={11} />
        </button>
      )}
    </div>
  );
}
