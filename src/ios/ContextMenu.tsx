import React from 'react';
import ReactDOM from 'react-dom';
import { hapticImpact } from '../native/haptics';
import { Icon, type IconName } from './icons';

/**
 * iOS menus.
 *
 * <MenuPopover> is the shared glass menu (title menus, context menus).
 * <ContextMenu> opens one on a 500ms long-press with a haptic, or on the
 * contextmenu event (right click, Shift+F10 / the Menu key) as the
 * keyboard and pointer alternative.
 */

export interface MenuItem {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  /** For selection menus: shows a checkmark and aria-checked. */
  checked?: boolean;
  /** Trailing visual in place of the icon (e.g. a color swatch); decorative. */
  accessory?: React.ReactNode;
  onSelect(): void;
}

export interface MenuAnchor {
  /** Viewport rect (or point, width/height 0) the menu attaches to. */
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MenuPopoverProps {
  items: MenuItem[];
  anchor: MenuAnchor;
  onClose(): void;
  /** Items are a single choice (menuitemradio with aria-checked). */
  radio?: boolean;
  /** Centre under the anchor (title menus) instead of aligning its start. */
  centered?: boolean;
  /** Dim + blur what's behind (context menus). */
  scrim?: boolean;
  label?: string;
}

const EDGE = 8;
const CHECK_ICON: IconName = 'checkmark';

export function MenuPopover({ items, anchor, onClose, radio = false, centered = false, scrim = false, label }: MenuPopoverProps) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number; origin: string } | null>(null);

  React.useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = centered ? anchor.left + anchor.width / 2 - rect.width / 2 : anchor.left;
    left = Math.max(EDGE, Math.min(left, vw - rect.width - EDGE));
    const below = anchor.top + anchor.height + 6;
    const fitsBelow = below + rect.height <= vh - EDGE;
    const top = fitsBelow ? below : Math.max(EDGE, anchor.top - rect.height - 6);
    setPos({ left, top, origin: `${centered ? 'center' : 'left'} ${fitsBelow ? 'top' : 'bottom'}` });
  }, [anchor, centered]);

  // Give focus back to the trigger on close.
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => {
      if (previous && document.contains(previous)) previous.focus?.({ preventScroll: true });
    };
  }, []);
  // Focus the first item once the menu is positioned (and visible).
  const placed = pos !== null;
  React.useEffect(() => {
    if (placed) menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus({ preventScroll: true });
  }, [placed]);
  // Escape closes the menu wherever focus is, before a sheet underneath sees it.
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => list[(n + list.length) % list.length]?.focus();
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        onClose();
        break;
      case 'Tab':
        e.preventDefault();
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        go(i + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        go(i - 1);
        break;
      case 'Home':
        e.preventDefault();
        go(0);
        break;
      case 'End':
        e.preventDefault();
        go(list.length - 1);
        break;
      default:
    }
  };

  return ReactDOM.createPortal(
    <div className={`ios-menu-layer${scrim ? ' ios-menu-layer--scrim' : ''}`}>
      <div
        className="ios-menu-layer__catcher"
        aria-hidden="true"
        onPointerDown={(e) => { e.preventDefault(); onClose(); }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label={label}
        className="ios-menu"
        style={pos ? { left: pos.left, top: pos.top, transformOrigin: pos.origin } : { left: anchor.left, top: anchor.top + anchor.height, visibility: 'hidden' }}
        onKeyDown={onKeyDown}
      >
        {items.map((item, idx) => (
          <button
            key={`${item.label}-${idx}`}
            type="button"
            role={radio ? 'menuitemradio' : 'menuitem'}
            aria-checked={radio ? !!item.checked : undefined}
            tabIndex={-1}
            className={`ios-menu__item${item.destructive ? ' ios-menu__item--destructive' : ''}`}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {radio && (
              <span className="ios-menu__check" aria-hidden="true">
                {item.checked && <Icon name={CHECK_ICON} size={15} />}
              </span>
            )}
            <span className="ios-menu__label">{item.label}</span>
            {item.accessory ? (
              <span className="ios-menu__icon" aria-hidden="true">{item.accessory}</span>
            ) : (
              item.icon && <Icon name={item.icon} size={19} className="ios-menu__icon" />
            )}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}

export interface ContextMenuProps {
  items: MenuItem[];
  children: React.ReactNode;
  /** Long-press duration in ms (iOS: about half a second). */
  delay?: number;
}

const MOVE_TOLERANCE = 10;

export function ContextMenu({ items, children, delay = 500 }: ContextMenuProps) {
  const [anchor, setAnchor] = React.useState<MenuAnchor | null>(null);
  const press = React.useRef<{ id: number; x: number; y: number; timer: number } | null>(null);
  const suppressClick = React.useRef(false);

  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  React.useEffect(() => cancelPress, []);

  const anchorFor = (target: EventTarget | null, x: number, y: number): MenuAnchor => {
    const el = target instanceof Element ? target : null;
    if ((x === 0 && y === 0) || Number.isNaN(x)) {
      const r = el?.getBoundingClientRect();
      if (r) return { left: r.left, top: r.top, width: r.width, height: r.height };
    }
    return { left: x, top: y, width: 0, height: 0 };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    suppressClick.current = false;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelPress();
    const { clientX: x, clientY: y, target, pointerId } = e;
    const timer = window.setTimeout(() => {
      press.current = null;
      suppressClick.current = true;
      hapticImpact();
      setAnchor(anchorFor(target, x, y));
    }, delay);
    press.current = { id: pointerId, x, y, timer };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) cancelPress();
  };

  // The menu renders outside the wrapper so its (portal-bubbled) events
  // don't reach the long-press handlers.
  return (
    <>
      <div
        className="ios-contextmenu"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        onClickCapture={(e) => {
          if (!suppressClick.current) return;
          suppressClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          cancelPress();
          setAnchor(anchorFor(e.target, e.clientX, e.clientY));
        }}
      >
        {children}
      </div>
      {anchor && <MenuPopover items={items} anchor={anchor} scrim onClose={() => setAnchor(null)} />}
    </>
  );
}
