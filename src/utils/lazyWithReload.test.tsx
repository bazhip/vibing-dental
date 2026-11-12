import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { lazyWithReload } from './lazyWithReload';

const Hello: React.FC = () => <p>hello</p>;

describe('lazyWithReload preload', () => {
  it('fetches the chunk once, shared between preload and render', async () => {
    const factory = vi.fn(async () => ({ default: Hello }));
    const Lazy = lazyWithReload(factory);
    Lazy.preload();
    Lazy.preload();
    render(<React.Suspense fallback={null}><Lazy /></React.Suspense>);
    expect(await screen.findByText('hello')).toBeInTheDocument();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed preload so the real render tries again', async () => {
    const factory = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ default: Hello });
    const Lazy = lazyWithReload(factory);
    Lazy.preload();
    await Promise.resolve(); await Promise.resolve();
    render(<React.Suspense fallback={null}><Lazy /></React.Suspense>);
    expect(await screen.findByText('hello')).toBeInTheDocument();
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
