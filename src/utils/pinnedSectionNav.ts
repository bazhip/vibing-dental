/**
 * The section navigation that pins under the app header on smaller
 * screens — the phone section menu, or the tablet tab strip (the desktop
 * sidebar is a side column and doesn't count). Things that pin or scroll
 * beneath the header must clear it.
 */
export function pinnedSectionNav(): HTMLElement | null {
  const menu = document.querySelector<HTMLElement>('.mobile-section-menu');
  if (menu && menu.offsetParent !== null) return menu;
  const nav = document.querySelector<HTMLElement>('.sidebar-layout__nav');
  if (nav && nav.offsetParent !== null && getComputedStyle(nav).flexDirection === 'row') return nav;
  return null;
}
