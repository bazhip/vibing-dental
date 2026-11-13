import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SwipeRow } from './SwipeRow';
import { List, ListRow, ListSection } from './List';

function row(onDelete = vi.fn(), onPin = vi.fn()) {
  render(
    <List>
      <ListSection>
        <SwipeRow
          actions={[
            { label: 'Delete', icon: 'trash', tone: 'destructive', onAction: onDelete },
            { label: 'Pin', tone: 'tint', onAction: onPin },
          ]}
        >
          <ListRow title="Jane Doe" />
        </SwipeRow>
      </ListSection>
    </List>
  );
  return { onDelete, onPin };
}

const content = () => document.querySelector('.ios-swiperow__content') as HTMLElement;
const ev = { pointerId: 7, pointerType: 'touch', isPrimary: true };

describe('SwipeRow', () => {
  it('actions are hidden until revealed, then reachable and callable from the keyboard', async () => {
    const user = userEvent.setup();
    const { onDelete } = row();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    const more = screen.getByRole('button', { name: 'More actions for Jane Doe' });
    more.focus();
    await user.keyboard('{Enter}');
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const del = screen.getByRole('button', { name: 'Delete' });
    del.focus();
    await user.keyboard('{Enter}');
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('swiping left reveals the actions; tapping outside closes them', () => {
    row();
    fireEvent.pointerDown(content(), { ...ev, clientX: 300, clientY: 20 });
    for (let x = 290; x >= 200; x -= 15) fireEvent.pointerMove(content(), { ...ev, clientX: x, clientY: 21 });
    fireEvent.pointerUp(content(), { ...ev, clientX: 200, clientY: 21 });
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('a full swipe triggers the first action', () => {
    const { onDelete, onPin } = row();
    fireEvent.pointerDown(content(), { ...ev, clientX: 330, clientY: 20 });
    for (let x = 310; x >= 10; x -= 20) fireEvent.pointerMove(content(), { ...ev, clientX: x, clientY: 21 });
    fireEvent.pointerUp(content(), { ...ev, clientX: 10, clientY: 21 });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onPin).not.toHaveBeenCalled();
  });

  it('a vertical drag does not open the row', () => {
    row();
    fireEvent.pointerDown(content(), { ...ev, clientX: 300, clientY: 20 });
    for (let y = 30; y <= 200; y += 20) fireEvent.pointerMove(content(), { ...ev, clientX: 296, clientY: y });
    fireEvent.pointerUp(content(), { ...ev, clientX: 296, clientY: 200 });
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});

it('falls back to the plain label when the row has no string title', () => {
  render(
    <List>
      <ListSection>
        <SwipeRow actions={[{ label: 'Delete', onAction: () => {} }]}>
          <ListRow title={<b>Jane</b>} />
        </SwipeRow>
        <SwipeRow label="Visit 3 May" actions={[{ label: 'Delete', onAction: () => {} }]}>
          <ListRow title={<b>Visit</b>} />
        </SwipeRow>
      </ListSection>
    </List>
  );
  expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'More actions for Visit 3 May' })).toBeInTheDocument();
});

describe('SwipeRow "More actions" button styling', () => {
  // The button is the keyboard / VoiceOver route. A tap or swipe must never
  // reveal it (it drew a circle over swiped rows): only :focus-visible may.
  it('is revealed by :focus-visible only, never by plain :focus', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/ios/ios.css', 'utf8');
    const selectors = [...css.matchAll(/([^{}]*\.ios-swiperow__more[^{}]*)\{/g)].map((m) => m[1]);
    expect(selectors.length).toBeGreaterThan(0);
    for (const sel of selectors) expect(sel).not.toMatch(/__more:focus(?!-visible)/);
  });
});
