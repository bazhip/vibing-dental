import React from 'react';
import { LayoutKind } from './Layouts';
import { readString, writeString } from '../utils/storage';

/**
 * A "board" is a complete UI design preset: layout structure + visual style
 * (CSS class on the document root) + theme (color tokens). The switcher is
 * a debug widget that lets the user A/B different designer-mockup-style
 * UIs for the same app shell.
 */

export interface Board {
  id: string;
  name: string;
  /** Short tagline shown under the board name. */
  vibe: string;
  layout: LayoutKind;
  /** CSS class applied on <html> via data-style. */
  style: string;
  /** Theme name from styles/themes.css (sets color tokens). */
  theme: string;
}

export const BOARDS: Board[] = [
  // Original clean tabs design.
  { id: 'clinical',  name: 'Clinical',         vibe: 'tabs · soft cards · indigo gradient',     layout: 'tabs',     style: 'clean',      theme: 'indigo' },

  // Stripe — top product nav, gradient hero, generous whitespace, blue+purple.
  { id: 'stripe',    name: 'Stripe Console',   vibe: 'top product nav · hero gradient',         layout: 'topnav',   style: 'stripe',     theme: 'cobalt' },

  // Twitter / X — three-column with icon rail, hairline dividers, white.
  { id: 'twitter',   name: 'Twitter / X',      vibe: 'icon rail · feed · trends column',        layout: 'threecol', style: 'twitter',    theme: 'paper' },

  // Linear — dark, dense sidebar, mono captions, fast keyboard feel.
  { id: 'linear',    name: 'Linear',           vibe: 'dark sidebar · mono captions · compact',  layout: 'sidebar',  style: 'linear',     theme: 'midnight' },

  // Notion — white, hierarchical sidebar with emojis, inline blocks.
  { id: 'notion',    name: 'Notion',           vibe: 'sidebar · emoji nav · inline blocks',     layout: 'sidebar',  style: 'notion',     theme: 'paper' },

  // GitHub — top breadcrumb header, octicon-style hairline borders.
  { id: 'github',    name: 'GitHub',           vibe: 'top breadcrumbs · hairline borders',      layout: 'topnav',   style: 'github',     theme: 'paper' },

  // Slack — purple+gray, condensed channel sidebar, dense info.
  { id: 'slack',     name: 'Slack',            vibe: 'purple sidebar · channel list',           layout: 'threecol', style: 'slack',      theme: 'plum' },

  // Airbnb — pill nav, rosy-red, big rounded cards, marketing feel.
  { id: 'airbnb',    name: 'Airbnb',           vibe: 'pill tabs · rosy-red · rounded cards',    layout: 'topnav',   style: 'airbnb',     theme: 'rose' },

  // Square — monochrome, mono numbers, tall blocks.
  { id: 'square',    name: 'Square',           vibe: 'mono · stacked black blocks',             layout: 'stacked',  style: 'square',     theme: 'charcoal' },

  // PayPal — blue-on-white wizard, step-by-step.
  { id: 'paypal',    name: 'PayPal Onboarding', vibe: 'step wizard · blue on white',            layout: 'wizard',   style: 'paypal',     theme: 'cobalt' },

  // Apple Health style — soft cards with elevation, neutral.
  { id: 'apple',     name: 'Apple Cards',      vibe: 'stacked · elevated cards · system fonts', layout: 'stacked',  style: 'apple',      theme: 'paper' },

  // Intercom — pink-accented, friendly chat-style chrome.
  { id: 'intercom',  name: 'Intercom',         vibe: 'pink accents · rounded · chatty',         layout: 'tabs',     style: 'intercom',   theme: 'rose' },

  // HubSpot — orange CTAs, top breadcrumb-y nav, pro SaaS.
  { id: 'hubspot',   name: 'HubSpot',          vibe: 'top nav · orange CTA · enterprise',       layout: 'topnav',   style: 'hubspot',    theme: 'sunset' },

  // Editorial / dossier — serif, columnar, paper bg.
  { id: 'editorial', name: 'Editorial',        vibe: 'serif · sidebar · paper',                 layout: 'sidebar',  style: 'editorial',  theme: 'paper' },

  // Brutalist — mono, hard shadows, no rounding.
  { id: 'brutalist', name: 'Brutalist',        vibe: 'mono · hard borders · offset shadow',     layout: 'tabs',     style: 'brutalist',  theme: 'paper' },

  // Glassmorphism — frosted panels, aurora bg.
  { id: 'glass',     name: 'Glass',            vibe: 'frosted panels · aurora bg',              layout: 'tabs',     style: 'glass',      theme: 'aurora' },

  // Cyberpunk neon.
  { id: 'neon',      name: 'Neon',             vibe: 'cyberpunk dark · neon glow',              layout: 'tabs',     style: 'neon',       theme: 'midnight' },

  // Cash App — bold green, mono numbers, simple stacked.
  { id: 'cash',      name: 'Cash App',         vibe: 'bold green · mono · simple stacked',      layout: 'stacked',  style: 'cash',       theme: 'emerald' },

  // Shopify — green top nav, clean white surfaces.
  { id: 'shopify',   name: 'Shopify',          vibe: 'top nav · green chrome · merchant-y',     layout: 'topnav',   style: 'shopify',    theme: 'forest' },

  // Discord — sidebar with channel icons, dark gray, indigo accent.
  { id: 'discord',   name: 'Discord',          vibe: 'channel rail · dark gray · indigo',       layout: 'threecol', style: 'discord',    theme: 'midnight' },
];

const STORAGE_KEY = 'board';
const STORAGE_VERSION = 1;
const DEFAULT_BOARD_ID = 'clinical';

interface BoardContextValue {
  board: Board;
  setBoardId: (id: string) => void;
}
const BoardCtx = React.createContext<BoardContextValue | null>(null);

export const BoardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [boardId, setBoardId] = React.useState<string>(() => {
    const saved = readString(STORAGE_KEY, STORAGE_VERSION, DEFAULT_BOARD_ID);
    return BOARDS.some((b) => b.id === saved) ? saved : DEFAULT_BOARD_ID;
  });

  const board = React.useMemo(
    () => BOARDS.find((b) => b.id === boardId) ?? BOARDS[0],
    [boardId]
  );

  // Apply style + theme to the document root whenever the board changes.
  React.useEffect(() => {
    document.documentElement.dataset.style = board.style;
    document.documentElement.dataset.theme = board.theme;
    document.documentElement.dataset.layout = board.layout;
    writeString(STORAGE_KEY, STORAGE_VERSION, board.id);
  }, [board]);

  const value = React.useMemo<BoardContextValue>(
    () => ({ board, setBoardId }),
    [board]
  );

  return <BoardCtx.Provider value={value}>{children}</BoardCtx.Provider>;
};

export function useBoard(): BoardContextValue {
  const ctx = React.useContext(BoardCtx);
  if (!ctx) throw new Error('useBoard must be used inside <BoardProvider>');
  return ctx;
}

export const BoardSwitcher: React.FC = () => {
  const { board, setBoardId } = useBoard();
  const [open, setOpen] = React.useState(false);

  return (
    <div className={`board-switcher${open ? ' board-switcher--open' : ''}`}>
      <button
        type="button"
        className="board-switcher__toggle"
        onClick={() => setOpen((o) => !o)}
        title="UI board (debug)"
        aria-label="Toggle UI board picker"
      >
        🎨
      </button>
      {open && (
        <div className="board-switcher__panel" role="dialog" aria-label="UI design boards">
          <div className="board-switcher__panel-head">
            <strong>Design board</strong>
            <span className="board-switcher__current">{board.name}</span>
          </div>
          <ul className="board-switcher__list">
            {BOARDS.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className={`board-switcher__option${b.id === board.id ? ' board-switcher__option--active' : ''}`}
                  onClick={() => setBoardId(b.id)}
                >
                  <span className="board-switcher__option-name">{b.name}</span>
                  <span className="board-switcher__option-vibe">{b.vibe}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
