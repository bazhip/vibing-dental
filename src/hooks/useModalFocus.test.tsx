import React from 'react';
import { render, screen } from '@testing-library/react';
import { useModalFocus } from './useModalFocus';

function Dialog({ open }: { open: boolean }) {
  const ref = useModalFocus(open);
  return <div ref={ref}><button type="button">ok</button></div>;
}

test('an open dialog holds the page still, and stacked dialogs release it only when the last closes', () => {
  const a = render(<Dialog open />);
  expect(document.body.style.position).toBe('fixed');
  const b = render(<Dialog open />);
  a.unmount();
  expect(document.body.style.position).toBe('fixed'); // second dialog still open
  b.unmount();
  expect(document.body.style.position).toBe('');
  expect(document.body.style.overflow).toBe('');
});

test('a closed dialog leaves the page alone', () => {
  render(<Dialog open={false} />);
  expect(document.body.style.position).toBe('');
});

test('initial focus skips controls excluded from the tab order', () => {
  function RovingDialog() {
    const ref = useModalFocus(true);
    return <div ref={ref}><button tabIndex={-1}>Inactive tab</button><button>Active tab</button></div>;
  }
  render(<RovingDialog />);
  expect(screen.getByRole('button', { name: 'Active tab' })).toHaveFocus();
});

test('initial focus skips inputs disabled by their fieldset', () => {
  function LockedDialog() {
    const ref = useModalFocus(true);
    return <div ref={ref}>
      <fieldset disabled><input aria-label="Locked field" /></fieldset>
      <button>Close</button>
    </div>;
  }
  render(<LockedDialog />);
  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
});
