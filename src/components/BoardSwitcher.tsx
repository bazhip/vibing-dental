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

/**
 * Each board id is shared by:
 *   - the UI theme tokens in styles/themes.css (`[data-theme="{id}"]`),
 *   - the UI chrome in styles/boards.css (`[data-style="{id}"]`),
 *   - the matching PDF preset in utils/pdf/styles.ts (same id).
 *
 * That keeps UI ↔ PDF in lockstep: pick a theme, the PDF preview opens
 * to the matching preset by default.
 */
export const BOARDS: Board[] = [
  { id: 'aperture', name: 'Aperture', vibe: 'glass · floating cards · system blue',          layout: 'sidebar', style: 'aperture', theme: 'aperture' },
  { id: 'ledger',   name: 'Ledger',   vibe: 'Stripe-grade SaaS · sidebar · violet accent',   layout: 'sidebar', style: 'ledger',   theme: 'ledger'   },
  { id: 'oracle',   name: 'Oracle',   vibe: 'Linear · dark · electric indigo · dense',       layout: 'topnav',  style: 'oracle',   theme: 'oracle'   },
  { id: 'folio',    name: 'Folio',    vibe: 'editorial · serif · cream + sepia',             layout: 'sidebar', style: 'folio',    theme: 'folio'    },
  { id: 'concrete', name: 'Concrete', vibe: 'brutalist mono · hard borders · square',        layout: 'tabs',    style: 'concrete', theme: 'concrete' },
  { id: 'atrium',   name: 'Atrium',   vibe: 'japandi · negative space · ochre',              layout: 'stacked', style: 'atrium',   theme: 'atrium'   },
  { id: 'pulse',    name: 'Pulse',    vibe: 'hospital EHR · cool blue · status chips',       layout: 'sidebar', style: 'pulse',    theme: 'pulse'    },
  { id: 'bauhaus',  name: 'Bauhaus',  vibe: 'modernist · RGB triad · 8pt grid',              layout: 'stacked', style: 'bauhaus',  theme: 'bauhaus'  },
  { id: 'vapor',    name: 'Vapor',    vibe: 'cyberpunk · neon glow · scanlines',             layout: 'topnav',  style: 'vapor',    theme: 'vapor'    },
  { id: 'almanac',  name: 'Almanac',  vibe: 'apothecary · maroon · drop caps',               layout: 'stacked', style: 'almanac',  theme: 'almanac'  },
];

const STORAGE_KEY = 'board';
const STORAGE_VERSION = 1;
const DEFAULT_BOARD_ID = 'aperture';

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
