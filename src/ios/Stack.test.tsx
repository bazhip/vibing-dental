import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { Stack, useStack } from './Stack';

function Beta() {
  const { depth, pop } = useStack();
  return (
    <div>
      <p>Beta screen, depth {depth}</p>
      <button onClick={pop}>Pop me</button>
    </div>
  );
}

function Alpha() {
  const { push } = useStack();
  return (
    <div>
      <p>Alpha screen</p>
      <button onClick={() => push({ id: 'beta', title: 'Beta', render: () => <Beta /> })}>Open Beta</button>
    </div>
  );
}

function Root() {
  const { push, depth } = useStack();
  return (
    <div>
      <p>Root screen, depth {depth}</p>
      <button onClick={() => push({ id: 'alpha', title: 'Alpha', render: () => <Alpha />, trailing: <button>Share</button> })}>
        Open Alpha
      </button>
    </div>
  );
}

describe('Stack', () => {
  it('push renders the new screen with a Back button labelled with the previous title; pop returns', async () => {
    render(<Stack root={<Root />} rootTitle="Settings" />);
    expect(screen.getByText('Root screen, depth 0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Alpha' }));
    expect(screen.getByText('Alpha screen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Settings/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Beta' }));
    expect(screen.getByText('Beta screen, depth 2')).toBeInTheDocument();
    const back = screen.getByRole('button', { name: /Alpha/ });
    fireEvent.click(back);
    await waitFor(() => expect(screen.queryByText(/Beta screen/)).toBeNull());
    expect(screen.getByText('Alpha screen')).toBeInTheDocument();
  });

  it('screens under the top one are hidden from assistive tech and keep their state', async () => {
    render(<Stack root={<Root />} rootTitle="Settings" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Alpha' }));
    // The root stays mounted (scroll position, inputs) but is inert.
    const rootText = screen.getByText(/Root screen/, { selector: 'p' });
    expect(rootText.closest('[aria-hidden="true"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Settings/ }));
    await waitFor(() => expect(screen.queryByText('Alpha screen')).toBeNull());
    expect(screen.getByText('Root screen, depth 0').closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByText('Root screen, depth 0').closest('[inert]')).toBeNull();
  });

  it('pop() from inside a pushed screen works', async () => {
    render(<Stack root={<Root />} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Beta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pop me' }));
    await waitFor(() => expect(screen.queryByText(/Beta screen/)).toBeNull());
  });

  it('an edge swipe from the left pops the top screen', async () => {
    render(<Stack root={<Root />} rootTitle="Settings" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Alpha' }));
    const layer = screen.getByText('Alpha screen').closest('.ios-stack__layer')!;
    const ev = { pointerId: 3, pointerType: 'touch', isPrimary: true };
    fireEvent.pointerDown(layer, { ...ev, clientX: 5, clientY: 300 });
    // Past half the width (jsdom's window is 1024 wide): pops without needing a flick.
    for (let x = 20; x <= 700; x += 40) fireEvent.pointerMove(layer, { ...ev, clientX: x, clientY: 302 });
    fireEvent.pointerUp(layer, { ...ev, clientX: 700, clientY: 302 });
    await waitFor(() => expect(screen.queryByText('Alpha screen')).toBeNull());
  });

  it('a swipe that does not start at the edge does not pop', async () => {
    render(<Stack root={<Root />} rootTitle="Settings" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Alpha' }));
    const layer = screen.getByText('Alpha screen').closest('.ios-stack__layer')!;
    const ev = { pointerId: 3, pointerType: 'touch', isPrimary: true };
    fireEvent.pointerDown(layer, { ...ev, clientX: 120, clientY: 300 });
    for (let x = 140; x <= 900; x += 40) fireEvent.pointerMove(layer, { ...ev, clientX: x, clientY: 302 });
    fireEvent.pointerUp(layer, { ...ev, clientX: 900, clientY: 302 });
    await new Promise((r) => setTimeout(r, 450));
    expect(screen.getByText('Alpha screen')).toBeInTheDocument();
  });
});
