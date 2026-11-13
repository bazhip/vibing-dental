import React from 'react';
import { render } from '@testing-library/react';
import { SidebarLayout, ChartSection } from './Layouts';

const sections: ChartSection[] = [
  { id: 'charting', label: 'Charting', content: <p>grid</p> },
  { id: 'diagnosis', label: 'Diagnosis', content: <p>diagram</p> },
  { id: 'imaging', label: 'Images', content: <p>images</p> },
];

const panel = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`[data-section-id="${id}"]`)!;

describe('SidebarLayout companions (wide-screen side-by-side)', () => {
  it('hides inactive panels inline when there are no companions', () => {
    const { container } = render(<SidebarLayout sections={sections} activeId="charting" />);
    expect(panel(container, 'diagnosis').style.display).toBe('none');
    expect(container.querySelector('.sidebar-layout--paired')).toBeNull();
  });

  it("leaves the active section's companion to CSS and marks the layout paired", () => {
    const { container } = render(
      <SidebarLayout sections={sections} activeId="charting" companions={{ charting: 'diagnosis' }} />
    );
    const companion = panel(container, 'diagnosis');
    expect(companion.style.display).toBe('');
    expect(companion.classList.contains('sidebar-layout__panel--companion')).toBe(true);
    expect(panel(container, 'imaging').style.display).toBe('none');
    expect(container.querySelector('.sidebar-layout--paired')).not.toBeNull();
  });

  it('does not pair when the active section has no companion', () => {
    const { container } = render(
      <SidebarLayout sections={sections} activeId="imaging" companions={{ charting: 'diagnosis' }} />
    );
    expect(panel(container, 'diagnosis').style.display).toBe('none');
    expect(container.querySelector('.sidebar-layout--paired')).toBeNull();
  });
});
