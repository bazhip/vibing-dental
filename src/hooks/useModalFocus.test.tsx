import React from 'react';
import { render } from '@testing-library/react';
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
