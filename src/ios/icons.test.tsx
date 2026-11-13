import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { Icon, ICON_NAMES } from './icons';

describe('Icon', () => {
  it('every icon renders an svg; decorative by default', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector('svg')!;
      expect(svg).not.toBeNull();
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.innerHTML.length).toBeGreaterThan(10);
      unmount();
    }
  });

  it('a titled icon is an image with that name, sized in pt', () => {
    render(<Icon name="gear" title="Settings" size={28} />);
    const img = screen.getByRole('img', { name: 'Settings' });
    expect(img).toHaveAttribute('width', '28');
  });

  it('includes the names the kit contract promises', () => {
    for (const n of ['chevron-left', 'chevron-right', 'chevron-down', 'xmark', 'ellipsis-circle', 'square-and-arrow-up',
      'doc-text', 'person-2', 'calendar-badge-clock', 'gear', 'magnifyingglass', 'line-3-horizontal-decrease', 'mic',
      'plus', 'trash', 'arrow-uturn-backward', 'arrow-uturn-forward', 'checkmark', 'bell', 'clock-arrow-circlepath',
      'sidebar-left', 'tooth', 'camera', 'photo']) {
      expect(ICON_NAMES).toContain(n);
    }
  });
});
