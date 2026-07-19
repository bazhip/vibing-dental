import React from 'react';
import { codesMatchingPrefix, DentalCode } from '../constants/dentalCodes';

/**
 * Drop-in replacement for <input> / <textarea> that pops a small suggestion
 * list whenever the word at the caret looks like a dental code prefix.
 *
 * Trigger rules — kept strict so the popup never gets in the way for
 * regular prose typing:
 *   - the word at the caret must be at least 1 character,
 *   - it must be entirely uppercase letters, digits, `/`, or `*`,
 *   - it must start with a letter (so just `4` or `/X` doesn't trigger),
 *   - and it must match the prefix of at least one known code.
 */

type CommonProps =
  | (React.InputHTMLAttributes<HTMLInputElement> & { multiline?: false })
  | (React.TextareaHTMLAttributes<HTMLTextAreaElement> & { multiline: true });

type CodeFieldProps = {
  value: string;
  onChange: (next: string) => void;
} & Omit<CommonProps, 'value' | 'onChange'>;

const TRIGGER_RE = /[A-Z][A-Z0-9/*]*$/;

export const CodeField: React.FC<CodeFieldProps> = ({
  value,
  onChange,
  multiline,
  ...rest
}) => {
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<DentalCode[]>([]);
  const [highlight, setHighlight] = React.useState(0);

  // User-supplied onKeyDown / onBlur from the caller — we chain to them
  // after our autocomplete handling so cell editors etc. still see the
  // events they need (e.g. to commit on Tab).
  const userOnKeyDown = (rest as { onKeyDown?: (e: React.KeyboardEvent) => void }).onKeyDown;
  const userOnBlur    = (rest as { onBlur?: (e: React.FocusEvent) => void }).onBlur;
  delete (rest as { onKeyDown?: unknown }).onKeyDown;
  delete (rest as { onBlur?: unknown }).onBlur;

  const refresh = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const m = before.match(TRIGGER_RE);
    if (!m || m[0].length < 1) {
      setOpen(false);
      return;
    }
    const next = codesMatchingPrefix(m[0]);
    if (next.length === 0) {
      setOpen(false);
      return;
    }
    setSuggestions(next);
    setHighlight(0);
    setOpen(true);
  };

  const insert = (code: string) => {
    const el = inputRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const m = before.match(TRIGGER_RE);
    if (!m) return;
    const head = before.slice(0, before.length - m[0].length) + code;
    const next = head + after;
    onChange(next);
    setOpen(false);
    queueMicrotask(() => {
      el.focus();
      const pos = head.length;
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        /* some inputs don't support selection range */
      }
    });
  };

  const handleChange: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement> = (
    e
  ) => {
    const next = e.currentTarget.value;
    onChange(next);
    refresh(next, e.currentTarget.selectionStart ?? next.length);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement> = (
    e
  ) => {
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insert(suggestions[highlight].code);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
    }
    // Popup is closed — chain to the caller's handler so cell editors
    // can commit on Tab/Enter, etc.
    userOnKeyDown?.(e);
  };

  const sharedProps = {
    // One ref serves both branches; each element narrows it on mount.
    ref: inputRef as React.Ref<HTMLInputElement & HTMLTextAreaElement>,
    value,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onBlur: (e: React.FocusEvent) => {
      // Delay so a click on the popup gets processed first.
      window.setTimeout(() => setOpen(false), 120);
      userOnBlur?.(e);
    },
  };

  const popup = open && (
    <div className="code-field__popup" role="listbox">
      {suggestions.map((s, i) => (
        <button
          type="button"
          key={s.code}
          role="option"
          aria-selected={i === highlight}
          className={`code-field__item${i === highlight ? ' code-field__item--active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            insert(s.code);
          }}
        >
          <span className="code-field__code">{s.code}</span>
          <span className="code-field__def">{s.definition}</span>
        </button>
      ))}
    </div>
  );

  return (
    <span className="code-field">
      {multiline ? (
        <textarea
          {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          {...sharedProps}
        />
      ) : (
        <input
          {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
          {...sharedProps}
        />
      )}
      {popup}
    </span>
  );
};
