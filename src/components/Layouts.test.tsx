import React from 'react';
import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { SidebarLayout, ChartSection } from './Layouts';

const sections: ChartSection[] = [
  { id: 'patient', label: 'Patient', content: <p>patient body</p> },
  { id: 'exam', label: 'Exam', content: <p>exam body</p> },
];

it('renders a trailing slot inside the phone section bar, next to the trigger', () => {
  const { container } = render(
    <SidebarLayout sections={sections} trailing={<span data-testid="extra">extra</span>} />
  );
  const menu = container.querySelector('.mobile-section-menu')!;
  const trailing = menu.querySelector('.mobile-section-menu__trailing');
  expect(trailing).not.toBeNull();
  expect(trailing!.querySelector('[data-testid="extra"]')).not.toBeNull();
});

it('without a trailing slot the markup is exactly as before (desktop rail and panels untouched)', () => {
  const plain = render(<SidebarLayout sections={sections} />).container;
  expect(plain.querySelector('.mobile-section-menu__trailing')).toBeNull();
  // The phone menu holds just its trigger when closed.
  expect(plain.querySelector('.mobile-section-menu')!.children).toHaveLength(1);
  const withTrailing = render(<SidebarLayout sections={sections} trailing={<span>x</span>} />).container;
  // Desktop rail and content panels are identical either way.
  for (const sel of ['.sidebar-layout__nav', '.sidebar-layout__main']) {
    expect(withTrailing.querySelector(sel)!.outerHTML).toBe(plain.querySelector(sel)!.outerHTML);
  }
});
