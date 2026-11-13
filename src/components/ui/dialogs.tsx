import React from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { isNativeApp } from '../../native/platform';
import { Icon } from '../../ios/icons';
import { exitDelay, trapTab, useMediaQuery } from '../../ios/gesture';
import { ApiError, LocalizedError, detailOnly, withDetail } from '../../utils/apiErrors';
import './dialogs.css';

// SF Symbol names (not text).
const CHECKMARK_CIRCLE_ICON = 'checkmark-circle';
const EXCLAMATIONMARK_CIRCLE_ICON = 'exclamationmark-circle';
const XMARK_ICON = 'xmark';

/**
 * App-wide confirm / prompt dialogs and toasts, replacing the browser's
 * native alert / confirm / prompt (which look like browser chrome, can be
 * blocked, and can't be styled or made destructive-red).
 *
 * Imperative and promise-based so hooks and plain functions can use them:
 *
 *   if (!(await confirmDialog({ title: 'Delete chart?', danger: true }))) return;
 *   const name = await promptDialog({ title: 'Template name' });
 *   toast('Chart saved', { kind: 'success' });
 *   toast('Column cleared', { action: { label: 'Undo', onClick: restore } });
 *
 * <DialogHost /> (mounted once at the app root) renders them. Without a
 * host (unit tests rendering a lone component) confirm/prompt fall back
 * to the native dialogs and toasts are dropped.
 *
 * In the iOS app (isNativeApp()) the same calls render as iOS components:
 * confirm and prompt as alerts, chooseDialog as an action sheet, toasts
 * as a capsule banner at the top. The website rendering is unchanged.
 */

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button — for deletes and other destructive actions. */
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: React.ReactNode;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  type?: 'text' | 'password';
  confirmLabel?: string;
  cancelLabel?: string;
  /** Return an error message to block confirming, or null when valid. */
  validate?: (value: string) => string | null;
  /** Show the value read-only (e.g. a link to copy); confirm copies it. */
  readOnly?: boolean;
}

export interface Choice {
  value: string;
  label: string;
  /** Red, and listed first (HIG) — e.g. "Discard Changes". */
  destructive?: boolean;
}

export interface ChoiceOptions {
  title: string;
  message?: React.ReactNode;
  choices: Choice[];
  cancelLabel?: string;
  /** The control that asked. On iPad (regular width) the action sheet is
   *  a popover next to it; without one it's a centred card. */
  anchor?: HTMLElement | DOMRect;
}

export interface ToastOptions {
  kind?: 'success' | 'error' | 'info';
  /** ms before auto-dismiss; errors default to staying until dismissed. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

type DialogRequest =
  | { kind: 'confirm'; id: number; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; id: number; opts: PromptOptions; resolve: (v: string | null) => void }
  | { kind: 'choose'; id: number; opts: ChoiceOptions; resolve: (v: string | null) => void }
  | { kind: 'sheet'; id: number; render: (p: SheetPresentation<unknown>) => React.ReactNode; resolve: (v: unknown) => void; closing?: boolean };

/** What presentSheet() hands its render function. */
export interface SheetPresentation<T> {
  /** Pass to <Sheet open>: false while the sheet slides away. */
  open: boolean;
  /** Resolve the promise (first call wins) and close the sheet. */
  finish: (value: T) => void;
}

/** Matches the kit sheet's exit slide (src/ios/Sheet.tsx). */
const SHEET_EXIT_MS = 380;

interface ToastItem { id: number; message: string; opts: ToastOptions }

interface Host {
  openDialog: (req: DialogRequest) => void;
  pushToast: (t: ToastItem) => void;
}

let host: Host | null = null;
let nextId = 1;
/** Toasts from toastWhenReady raised before <DialogHost /> mounted. */
let pendingToasts: ToastItem[] = [];

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (!host) {
    const text = [opts.title, typeof opts.message === 'string' ? opts.message : ''].filter(Boolean).join('\n\n');
    return Promise.resolve(typeof window !== 'undefined' && typeof window.confirm === 'function' ? !!window.confirm(text) : false);
  }
  const h = host;
  return new Promise((resolve) => h.openDialog({ kind: 'confirm', id: nextId++, opts, resolve }));
}

export function promptDialog(opts: PromptOptions): Promise<string | null> {
  if (!host) {
    const v = typeof window !== 'undefined' && typeof window.prompt === 'function' ? window.prompt(opts.title, opts.defaultValue ?? '') : null;
    return Promise.resolve(v);
  }
  const h = host;
  return new Promise((resolve) => h.openDialog({ kind: 'prompt', id: nextId++, opts, resolve }));
}

/**
 * Choices related to an action the user just took (e.g. discard or keep a
 * draft). Resolves with the chosen value, or null on Cancel. Renders as an
 * action sheet in the iOS app.
 */
export function chooseDialog(opts: ChoiceOptions): Promise<string | null> {
  if (!host) return Promise.resolve(null);
  const h = host;
  return new Promise((resolve) => h.openDialog({ kind: 'choose', id: nextId++, opts, resolve }));
}

/**
 * Show a one-off <Sheet> from plain code (e.g. a consent sheet before an
 * action) through the mounted <DialogHost />. `render` gets `open` and
 * `finish`; the promise resolves with the value passed to `finish`, or
 * with `fallback` straight away when there's no host.
 */
export function presentSheet<T>(render: (p: SheetPresentation<T>) => React.ReactNode, fallback: T): Promise<T> {
  if (!host) return Promise.resolve(fallback);
  const h = host;
  return new Promise<T>((resolve) =>
    h.openDialog({
      kind: 'sheet',
      id: nextId++,
      render: render as (p: SheetPresentation<unknown>) => React.ReactNode,
      resolve: resolve as (v: unknown) => void,
    })
  );
}

export function toast(message: string, opts: ToastOptions = {}): void {
  host?.pushToast({ id: nextId++, message, opts });
}

/** Like toast(), but when no host is mounted yet (e.g. something that
 *  happens during app start-up, before React's first commit) the toast is
 *  held and shown as soon as <DialogHost /> mounts instead of dropped. */
export function toastWhenReady(message: string, opts: ToastOptions = {}): void {
  const item = { id: nextId++, message, opts };
  if (host) host.pushToast(item);
  else pendingToasts.push(item);
}

/** Turn an unknown error into a sentence a user can act on. Known
 *  failure patterns get their own message; already-translated errors
 *  (LocalizedError, coded server errors) show as-is; any other raw text is
 *  wrapped as "Something went wrong (details: …)" outside English. */
export function friendlyError(err: unknown, fallback = i18n.t('errors.generic')): string {
  return describeError(err, fallback, withDetail);
}

/** friendlyError for the `{{error}}` slot of a message that already says
 *  what failed ("Couldn’t open that chart. {{error}}"): raw text reads
 *  "Details: …" outside English instead of a second failure sentence.
 *  Identical to friendlyError in English. */
export function friendlyDetail(err: unknown): string {
  return describeError(err, i18n.t('errors.generic'), detailOnly);
}

function describeError(err: unknown, fallback: string, wrapRaw: (detail: string) => string): string {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (!msg) return fallback;
  // Coded server errors are matched on their English text, as before codes.
  const probe = err instanceof ApiError ? err.serverMessage : msg;
  if (/failed to fetch|network|load failed/i.test(probe)) return i18n.t('errors.network');
  if (/JSON object requested|multiple \(or no\) rows|PGRST116/i.test(probe)) return i18n.t('errors.notFound');
  if (/permission denied|row-level security|42501/i.test(probe)) return i18n.t('errors.permission');
  if (/rate limit|too many/i.test(probe)) return i18n.t('errors.rateLimit');
  if (err instanceof LocalizedError) return msg;
  return wrapRaw(msg);
}

// ---------------------------------------------------------------------------

function useBackdropClose(onClose: () => void) {
  // Close only when the press both starts and ends on the backdrop, so
  // drag-selecting text in a field and releasing outside doesn't close it.
  const downOnBackdrop = React.useRef(false);
  return {
    onMouseDown: (e: React.MouseEvent) => { downOnBackdrop.current = e.target === e.currentTarget; },
    onClick: (e: React.MouseEvent) => {
      if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
      downOnBackdrop.current = false;
    },
  };
}

function ConfirmView({ req, onDone }: { req: Extract<DialogRequest, { kind: 'confirm' }>; onDone: (v: boolean) => void }) {
  const { t } = useTranslation();
  const { opts } = req;
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    // Destructive dialogs focus Cancel, so a stray Enter can't delete.
    (opts.danger ? cancelRef : confirmRef).current?.focus();
  }, [opts.danger]);
  const backdrop = useBackdropClose(() => onDone(false));
  const titleId = `dlg-title-${req.id}`;
  return (
    <div className="ui-dialog-overlay" {...backdrop}>
      <div className="ui-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="ui-dialog__title">{opts.title}</h2>
        {opts.message && <div className="ui-dialog__message">{opts.message}</div>}
        <div className="ui-dialog__actions">
          <button ref={cancelRef} type="button" className="ui-btn ui-btn--secondary" onClick={() => onDone(false)}>
            {opts.cancelLabel ?? t('actions.cancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`ui-btn ${opts.danger ? 'ui-btn--danger' : 'ui-btn--primary'}`}
            onClick={() => onDone(true)}
          >
            {opts.confirmLabel ?? t('actions.ok')}
          </button>
        </div>
      </div>
    </div>
  );
}

function PromptView({ req, onDone }: { req: Extract<DialogRequest, { kind: 'prompt' }>; onDone: (v: string | null) => void }) {
  const { t } = useTranslation();
  const { opts } = req;
  const [value, setValue] = React.useState(opts.defaultValue ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const backdrop = useBackdropClose(() => onDone(null));
  const submit = () => {
    if (opts.readOnly) {
      navigator.clipboard?.writeText(value).catch(() => { /* manual copy still possible */ });
      onDone(value);
      return;
    }
    const err = opts.validate?.(value) ?? null;
    if (err) { setError(err); return; }
    onDone(value);
  };
  const titleId = `dlg-title-${req.id}`;
  const inputId = `dlg-input-${req.id}`;
  return (
    <div className="ui-dialog-overlay" {...backdrop}>
      <form
        className="ui-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <h2 id={titleId} className="ui-dialog__title">{opts.title}</h2>
        {opts.message && <div className="ui-dialog__message">{opts.message}</div>}
        {opts.label && <label htmlFor={inputId} className="ui-dialog__label">{opts.label}</label>}
        <input
          id={inputId}
          ref={inputRef}
          className="ui-dialog__input"
          type={opts.type ?? 'text'}
          value={value}
          placeholder={opts.placeholder}
          readOnly={opts.readOnly}
          aria-invalid={!!error}
          aria-label={opts.label ? undefined : opts.title}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
        />
        {error && <p className="ui-dialog__error" role="alert">{error}</p>}
        <div className="ui-dialog__actions">
          <button type="button" className="ui-btn ui-btn--secondary" onClick={() => onDone(null)}>
            {opts.cancelLabel ?? (opts.readOnly ? t('actions.close') : t('actions.cancel'))}
          </button>
          <button type="submit" className="ui-btn ui-btn--primary">
            {opts.confirmLabel ?? (opts.readOnly ? t('actions.copy') : t('actions.ok'))}
          </button>
        </div>
      </form>
    </div>
  );
}

function ChoiceView({ req, onDone }: { req: Extract<DialogRequest, { kind: 'choose' }>; onDone: (v: string | null) => void }) {
  const { opts } = req;
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => { cancelRef.current?.focus(); }, []);
  const backdrop = useBackdropClose(() => onDone(null));
  const titleId = `dlg-title-${req.id}`;
  return (
    <div className="ui-dialog-overlay" {...backdrop}>
      <div className="ui-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="ui-dialog__title">{opts.title}</h2>
        {opts.message && <div className="ui-dialog__message">{opts.message}</div>}
        <div className="ui-dialog__actions">
          <button ref={cancelRef} type="button" className="ui-btn ui-btn--secondary" onClick={() => onDone(null)}>
            {opts.cancelLabel ?? i18n.t('actions.cancel')}
          </button>
          {opts.choices.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`ui-btn ${c.destructive ? 'ui-btn--danger' : 'ui-btn--primary'}`}
              onClick={() => onDone(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- iOS app rendering -----------------------------------------------------

function NativeConfirm({ req, onDone }: { req: Extract<DialogRequest, { kind: 'confirm' }>; onDone: (v: boolean) => void }) {
  const { opts } = req;
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    (opts.danger ? cancelRef : confirmRef).current?.focus();
  }, [opts.danger]);
  const titleId = `dlg-title-${req.id}`;
  const msgId = `dlg-msg-${req.id}`;
  return (
    <div className="ios-alert-overlay">
      <div
        className="ios-alert"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={opts.message ? msgId : undefined}
        onKeyDown={(e) => trapTab(e, e.currentTarget)}
      >
        <div className="ios-alert__content">
          <h2 id={titleId} className="ios-alert__title">{opts.title}</h2>
          {opts.message && <div id={msgId} className="ios-alert__message">{opts.message}</div>}
        </div>
        <div className="ios-alert__buttons">
          <button ref={cancelRef} type="button" className="ios-alert__button ios-alert__button--cancel" onClick={() => onDone(false)}>
            {opts.cancelLabel ?? i18n.t('actions.cancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`ios-alert__button ${opts.danger ? 'ios-alert__button--destructive' : 'ios-alert__button--default'}`}
            onClick={() => onDone(true)}
          >
            {opts.confirmLabel ?? i18n.t('actions.ok')}
          </button>
        </div>
      </div>
    </div>
  );
}

function NativePrompt({ req, onDone }: { req: Extract<DialogRequest, { kind: 'prompt' }>; onDone: (v: string | null) => void }) {
  const { opts } = req;
  const [value, setValue] = React.useState(opts.defaultValue ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const submit = () => {
    if (opts.readOnly) {
      navigator.clipboard?.writeText(value).catch(() => { /* manual copy still possible */ });
      onDone(value);
      return;
    }
    const err = opts.validate?.(value) ?? null;
    if (err) { setError(err); return; }
    onDone(value);
  };
  const titleId = `dlg-title-${req.id}`;
  const msgId = `dlg-msg-${req.id}`;
  return (
    <div className="ios-alert-overlay">
      <form
        className="ios-alert"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={opts.message ? msgId : undefined}
        onKeyDown={(e) => trapTab(e, e.currentTarget)}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <div className="ios-alert__content">
          <h2 id={titleId} className="ios-alert__title">{opts.title}</h2>
          {opts.message && <div id={msgId} className="ios-alert__message">{opts.message}</div>}
          <input
            ref={inputRef}
            className="ios-alert__input"
            type={opts.type ?? 'text'}
            value={value}
            placeholder={opts.placeholder}
            readOnly={opts.readOnly}
            aria-invalid={!!error}
            aria-label={opts.label ?? opts.title}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
          />
          {error && <p className="ios-alert__error" role="alert">{error}</p>}
        </div>
        <div className="ios-alert__buttons">
          <button type="button" className="ios-alert__button ios-alert__button--cancel" onClick={() => onDone(null)}>
            {opts.cancelLabel ?? (opts.readOnly ? i18n.t('actions.close') : i18n.t('actions.cancel'))}
          </button>
          <button type="submit" className="ios-alert__button ios-alert__button--default">
            {opts.confirmLabel ?? (opts.readOnly ? i18n.t('ios.copy') : i18n.t('actions.ok'))}
          </button>
        </div>
      </form>
    </div>
  );
}

const POPOVER_WIDTH = 320;
const POPOVER_GAP = 10;
const POPOVER_EDGE = 12;

function NativeActionSheet({ req, onDone }: { req: Extract<DialogRequest, { kind: 'choose' }>; onDone: (v: string | null) => void }) {
  const { opts } = req;
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { cancelRef.current?.focus({ preventScroll: true }); }, []);
  const backdrop = useBackdropClose(() => onDone(null));
  const titleId = `dlg-title-${req.id}`;
  const msgId = `dlg-msg-${req.id}`;
  // HIG: destructive choices first, Cancel last and set apart.
  const choices = [...opts.choices.filter((c) => c.destructive), ...opts.choices.filter((c) => !c.destructive)];
  // iPad (regular width): a popover at the control that asked, or a centred
  // card when there is no anchor. iPhone: a sheet from the bottom.
  const regular = useMediaQuery('(min-width: 768px)');
  const layout: 'sheet' | 'popover' | 'card' = !regular ? 'sheet' : opts.anchor ? 'popover' : 'card';

  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);
  React.useLayoutEffect(() => {
    if (layout !== 'popover' || !opts.anchor) return undefined;
    const anchor = opts.anchor;
    const place = () => {
      const a = anchor instanceof Element ? anchor.getBoundingClientRect() : anchor;
      const h = sheetRef.current?.getBoundingClientRect().height ?? 0;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.max(POPOVER_EDGE, Math.min(a.left + a.width / 2 - POPOVER_WIDTH / 2, vw - POPOVER_WIDTH - POPOVER_EDGE));
      const below = a.top + a.height + POPOVER_GAP;
      const top = below + h <= vh - POPOVER_EDGE ? below : Math.max(POPOVER_EDGE, a.top - POPOVER_GAP - h);
      setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
    };
    place();
    // Rotation / split-view resize moves the control: follow it (a fixed
    // DOMRect can only be re-clamped to the new viewport).
    window.addEventListener('resize', place);
    window.addEventListener('orientationchange', place);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('orientationchange', place);
    };
  }, [layout, opts.anchor]);

  const cancelLabel = opts.cancelLabel ?? i18n.t('actions.cancel');
  return (
    <div className={`ios-action-sheet-overlay ios-action-sheet-overlay--${layout}`} {...backdrop}>
      <div
        ref={sheetRef}
        className={`ios-action-sheet ios-action-sheet--${layout}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={opts.message ? msgId : undefined}
        style={layout === 'popover' ? (pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }) : undefined}
        onKeyDown={(e) => trapTab(e, e.currentTarget)}
      >
        <div className="ios-action-sheet__group">
          <div className="ios-action-sheet__header">
            <h2 id={titleId} className="ios-action-sheet__title">{opts.title}</h2>
            {opts.message && <div id={msgId} className="ios-action-sheet__message">{opts.message}</div>}
          </div>
          {choices.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`ios-action-sheet__button${c.destructive ? ' ios-action-sheet__button--destructive' : ''}`}
              onClick={() => onDone(c.value)}
            >
              {c.label}
            </button>
          ))}
          {layout === 'popover' && (
            // Popovers drop the visible Cancel (a tap outside cancels, HIG);
            // keyboard, Switch Control and VoiceOver still get one.
            <button ref={cancelRef} type="button" className="ios-action-sheet__button ios-action-sheet__popover-cancel" onClick={() => onDone(null)}>
              {cancelLabel}
            </button>
          )}
        </div>
        {layout !== 'popover' && (
          <button ref={cancelRef} type="button" className="ios-action-sheet__cancel" onClick={() => onDone(null)}>
            {cancelLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function NativeToast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const kind = item.opts.kind ?? 'info';
  useAutoDismiss(item, onDismiss);
  return (
    <div className={`ios-toast ios-toast--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {kind === 'success' && <Icon name={CHECKMARK_CIRCLE_ICON} filled size={20} className="ios-toast__icon" />}
      {kind === 'error' && <Icon name={EXCLAMATIONMARK_CIRCLE_ICON} filled size={20} className="ios-toast__icon" />}
      <span className="ios-toast__msg">{item.message}</span>
      {item.opts.action && (
        <button
          type="button"
          className="ios-toast__action"
          onClick={() => { item.opts.action!.onClick(); onDismiss(); }}
        >
          {item.opts.action.label}
        </button>
      )}
      <button type="button" className="ios-toast__close" onClick={onDismiss} aria-label={i18n.t('actions.close')}>
        <Icon name={XMARK_ICON} size={14} />
      </button>
    </div>
  );
}

/** Mount once at the app root. */
export function DialogHost() {
  const [dialogs, setDialogs] = React.useState<DialogRequest[]>([]);
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const returnFocus = React.useRef<HTMLElement[]>([]);

  React.useEffect(() => {
    host = {
      openDialog: (req) => {
        returnFocus.current.push(document.activeElement as HTMLElement);
        setDialogs((d) => [...d, req]);
      },
      pushToast: (t) => setToasts((list) => [...list.slice(-3), t]),
    };
    if (pendingToasts.length) {
      const held = pendingToasts;
      pendingToasts = [];
      held.forEach((t) => host?.pushToast(t));
    }
    return () => { host = null; };
  }, []);

  const finish = React.useCallback((id: number, value: boolean | string | null) => {
    setDialogs((d) => {
      const req = d.find((x) => x.id === id);
      if (req) (req.resolve as (v: unknown) => void)(value);
      return d.filter((x) => x.id !== id);
    });
    const el = returnFocus.current.pop();
    window.setTimeout(() => el?.focus?.(), 0);
  }, []);

  // A presented sheet: resolve now, let it slide away, then drop it. The
  // sheet puts focus back itself.
  const finishSheet = React.useCallback((id: number, value: unknown) => {
    let first = false;
    setDialogs((d) =>
      d.map((x) => {
        if (x.id !== id || x.kind !== 'sheet' || x.closing) return x;
        first = true;
        x.resolve(value);
        return { ...x, closing: true };
      })
    );
    window.setTimeout(() => {
      if (!first) return;
      returnFocus.current.pop();
      setDialogs((d) => d.filter((x) => x.id !== id));
    }, exitDelay(SHEET_EXIT_MS));
  }, []);
  const sheets = dialogs.filter((x): x is Extract<DialogRequest, { kind: 'sheet' }> => x.kind === 'sheet');
  const sheetLayer = sheets.map((x) => (
    <React.Fragment key={x.id}>{x.render({ open: !x.closing, finish: (v) => finishSheet(x.id, v) })}</React.Fragment>
  ));

  // Escape closes only the top dialog, and stops other handlers (an open
  // modal underneath) from also closing. Sheets handle their own Escape.
  const top = dialogs.filter((x) => x.kind !== 'sheet').pop();
  React.useEffect(() => {
    if (!top) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      finish(top.id, top.kind === 'confirm' ? false : null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [top, finish]);

  const dismissToast = (id: number) => setToasts((list) => list.filter((t) => t.id !== id));

  if (isNativeApp()) {
    return ReactDOM.createPortal(
      <>
        {sheetLayer}
        {top?.kind === 'confirm' && <NativeConfirm key={top.id} req={top} onDone={(v) => finish(top.id, v)} />}
        {top?.kind === 'prompt' && <NativePrompt key={top.id} req={top} onDone={(v) => finish(top.id, v)} />}
        {top?.kind === 'choose' && <NativeActionSheet key={top.id} req={top} onDone={(v) => finish(top.id, v)} />}
        <div className="ios-toasts" aria-live="polite" aria-atomic="false">
          {toasts.map((t) => (
            <NativeToast key={t.id} item={t} onDismiss={() => dismissToast(t.id)} />
          ))}
        </div>
      </>,
      document.body
    );
  }

  return ReactDOM.createPortal(
    <>
      {sheetLayer}
      {top?.kind === 'confirm' && <ConfirmView key={top.id} req={top} onDone={(v) => finish(top.id, v)} />}
      {top?.kind === 'prompt' && <PromptView key={top.id} req={top} onDone={(v) => finish(top.id, v)} />}
      {top?.kind === 'choose' && <ChoiceView key={top.id} req={top} onDone={(v) => finish(top.id, v)} />}
      <div className="ui-toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={() => dismissToast(t.id)} />
        ))}
      </div>
    </>,
    document.body
  );
}

/** Auto-dismiss a toast; errors stay until dismissed. */
function useAutoDismiss(item: ToastItem, onDismiss: () => void) {
  const kind = item.opts.kind ?? 'info';
  const duration = item.opts.duration ?? (kind === 'error' ? 0 : item.opts.action ? 8000 : 4000);
  React.useEffect(() => {
    if (!duration) return;
    const t = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(t);
  }, [duration, onDismiss]);
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const { t } = useTranslation();
  const kind = item.opts.kind ?? 'info';
  useAutoDismiss(item, onDismiss);
  return (
    <div className={`ui-toast ui-toast--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="ui-toast__msg">{item.message}</span>
      {item.opts.action && (
        <button
          type="button"
          className="ui-toast__action"
          onClick={() => { item.opts.action!.onClick(); onDismiss(); }}
        >
          {item.opts.action.label}
        </button>
      )}
      <button type="button" className="ui-toast__close" onClick={onDismiss} aria-label={t('actions.dismiss')}>×</button>
    </div>
  );
}
