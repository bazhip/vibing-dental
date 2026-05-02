import React from 'react';

interface TabProps {
  label: string;
  children: React.ReactNode;
}

/**
 * Marker component — the actual rendering happens in Tabs. Tab itself just
 * carries its `label` prop forward via React.Children inspection.
 */
export const Tab: React.FC<TabProps> = ({ children }) => <>{children}</>;

interface TabsProps {
  /** Optional initial active tab index (defaults to 0). */
  defaultIndex?: number;
  children: React.ReactNode;
}

/**
 * Lightweight tabbed container. Each direct child is expected to be a
 * <Tab label="…">. Inactive panels are kept mounted (display:none) so any
 * imperative refs (e.g. SVGs that get captured for PDF export) survive
 * tab switches.
 */
export const Tabs: React.FC<TabsProps> = ({ defaultIndex = 0, children }) => {
  const tabs = React.Children.toArray(children).filter(
    (c): c is React.ReactElement<TabProps> =>
      React.isValidElement(c) && (c.type === Tab || (c.props as TabProps)?.label !== undefined)
  );
  const [active, setActive] = React.useState(defaultIndex);

  return (
    <div className="tabs">
      <div className="tabs__bar" role="tablist">
        {tabs.map((t, i) => (
          <button
            type="button"
            key={i}
            role="tab"
            aria-selected={i === active}
            className={`tabs__tab${i === active ? ' tabs__tab--active' : ''}`}
            onClick={() => setActive(i)}
          >
            {t.props.label}
          </button>
        ))}
      </div>
      <div className="tabs__panels">
        {tabs.map((t, i) => (
          <div
            key={i}
            role="tabpanel"
            className="tabs__panel"
            style={i === active ? undefined : { display: 'none' }}
          >
            {t}
          </div>
        ))}
      </div>
    </div>
  );
};
