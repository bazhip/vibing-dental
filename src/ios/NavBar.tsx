import React from 'react';
import { Icon, type IconName } from './icons';
import { MenuPopover, type MenuAnchor } from './ContextMenu';
import { ScrollContainerContext } from './scrollContainer';

/**
 * iOS navigation bar.
 *
 * Sticky glass bar with leading / centred title / trailing slots. With
 * `largeTitle`, a large title sits below the bar and scrolls away with the
 * content; once it has scrolled under the bar, the inline title fades in
 * and the bar gets its material (the iOS scroll-edge behaviour). Without a
 * large title the material appears as soon as the content scrolls.
 *
 * `titleMenu` turns the title into a button that opens a selection menu
 * (chevron-down after the title, like a SwiftUI toolbar title menu).
 *
 * `scrollRef` is the scroll container the bar lives in. When omitted, the
 * enclosing <Stack> layer is used (ScrollContainerContext), else the window.
 */

const CHEVRON_DOWN: IconName = 'chevron-down';

export interface TitleMenuItem {
  label: string;
  onSelect(): void;
  checked?: boolean;
}

export interface NavBarProps {
  title: string;
  subtitle?: string;
  largeTitle?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  titleMenu?: TitleMenuItem[];
  scrollRef?: React.RefObject<HTMLElement | null>;
}

export function NavBar({ title, subtitle, largeTitle = false, leading, trailing, titleMenu, scrollRef }: NavBarProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [menuAnchor, setMenuAnchor] = React.useState<MenuAnchor | null>(null);
  const largeRef = React.useRef<HTMLDivElement>(null);
  const contextRef = React.useContext(ScrollContainerContext);
  const containerRef = scrollRef ?? contextRef;

  React.useEffect(() => {
    const el = containerRef?.current ?? null;
    const target: HTMLElement | Window = el ?? window;
    const read = () => (el ? el.scrollTop : window.scrollY);
    const onScroll = () => {
      const y = read();
      // Collapse once the large title has gone under the bar.
      const threshold = largeTitle ? Math.max(8, (largeRef.current?.offsetHeight ?? 44) - 8) : 0;
      setCollapsed(y > threshold);
    };
    onScroll();
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => target.removeEventListener('scroll', onScroll);
  }, [containerRef, largeTitle]);

  const openMenu = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenuAnchor({ left: r.left, top: r.top, width: r.width, height: r.height });
  };

  const titleContent = (large: boolean, focusable: boolean) =>
    titleMenu ? (
      <button
        type="button"
        className={`ios-navbar__title-button${large ? ' ios-navbar__title-button--large' : ''}`}
        aria-haspopup="menu"
        aria-expanded={menuAnchor ? true : false}
        tabIndex={focusable ? undefined : -1}
        onClick={openMenu}
      >
        <span className="ios-navbar__title-text">{title}</span>
        <Icon name={CHEVRON_DOWN} size={large ? 18 : 12} className="ios-navbar__title-chevron" />
      </button>
    ) : (
      <span className="ios-navbar__title-text">{title}</span>
    );

  // The heading is the large title when there is one, the inline title otherwise.
  const inlineHidden = largeTitle;
  return (
    <>
      <header
        className={`ios-navbar${largeTitle ? ' ios-navbar--large' : ''}${collapsed ? ' ios-navbar--collapsed' : ''}`}
      >
        <div className="ios-navbar__bar">
          <div className="ios-navbar__leading">{leading}</div>
          {inlineHidden ? (
            <div className="ios-navbar__title" aria-hidden="true">
              {titleContent(false, false)}
              {subtitle && <span className="ios-navbar__subtitle">{subtitle}</span>}
            </div>
          ) : (
            <div className="ios-navbar__title">
              <h1 className="ios-navbar__heading">{titleContent(false, true)}</h1>
              {subtitle && <span className="ios-navbar__subtitle">{subtitle}</span>}
            </div>
          )}
          <div className="ios-navbar__trailing">{trailing}</div>
        </div>
      </header>
      {largeTitle && (
        <div ref={largeRef} className="ios-navbar__large">
          <h1 className="ios-navbar__large-title">{titleContent(true, true)}</h1>
          {subtitle && <p className="ios-navbar__large-subtitle">{subtitle}</p>}
        </div>
      )}
      {menuAnchor && titleMenu && (
        <MenuPopover
          items={titleMenu}
          anchor={menuAnchor}
          radio
          centered={collapsed || !largeTitle}
          label={title}
          onClose={() => setMenuAnchor(null)}
        />
      )}
    </>
  );
}
