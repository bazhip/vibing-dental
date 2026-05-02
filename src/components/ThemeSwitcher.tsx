import React from 'react';

const THEMES = [
  'indigo', 'emerald', 'coral', 'slate', 'midnight',
  'rose', 'sunset', 'forest', 'ocean', 'terracotta',
  'lavender', 'charcoal', 'citrus', 'cobalt', 'sage',
  'plum', 'sand', 'crimson', 'mint', 'onyx',
  'paper', 'bubblegum', 'aurora',
] as const;

const LAYOUTS = [
  'comfortable', 'compact', 'wide', 'centered', 'spacious',
] as const;

type Theme = typeof THEMES[number];
type Layout = typeof LAYOUTS[number];

const STORAGE_THEME = 'vibing-dental-theme';
const STORAGE_LAYOUT = 'vibing-dental-layout';

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(STORAGE_THEME, theme); } catch {}
}

function applyLayout(layout: Layout) {
  document.documentElement.dataset.layout = layout;
  try { localStorage.setItem(STORAGE_LAYOUT, layout); } catch {}
}

/**
 * Debug-only chrome for previewing themes / layouts. Sits as a small floating
 * widget in the corner; the user picks from the dropdowns and the choice
 * applies via `data-theme` / `data-layout` attributes on the document root,
 * which the CSS variables in `styles/themes.css` respond to. Selection
 * persists in localStorage.
 */
export const ThemeSwitcher: React.FC = () => {
  const [theme, setTheme] = React.useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_THEME);
      if (saved && (THEMES as readonly string[]).includes(saved)) return saved as Theme;
    } catch {}
    return 'indigo';
  });
  const [layout, setLayout] = React.useState<Layout>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_LAYOUT);
      if (saved && (LAYOUTS as readonly string[]).includes(saved)) return saved as Layout;
    } catch {}
    return 'comfortable';
  });
  const [collapsed, setCollapsed] = React.useState(true);

  React.useEffect(() => { applyTheme(theme); }, [theme]);
  React.useEffect(() => { applyLayout(layout); }, [layout]);

  return (
    <div className={`theme-switcher${collapsed ? ' theme-switcher--collapsed' : ''}`}>
      <button
        type="button"
        className="theme-switcher__toggle"
        onClick={() => setCollapsed((c) => !c)}
        title="Theme & layout (debug)"
        aria-label="Toggle theme switcher"
      >
        🎨
      </button>
      {!collapsed && (
        <div className="theme-switcher__panel">
          <label className="theme-switcher__row">
            <span>Theme</span>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
            >
              {THEMES.map((t) => (
                <option key={t} value={t}>{titleCase(t)}</option>
              ))}
            </select>
          </label>
          <label className="theme-switcher__row">
            <span>Layout</span>
            <select
              value={layout}
              onChange={(e) => setLayout(e.target.value as Layout)}
            >
              {LAYOUTS.map((l) => (
                <option key={l} value={l}>{titleCase(l)}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
};

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
