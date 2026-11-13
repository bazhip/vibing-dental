import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const flags = vi.hoisted(() => ({ native: true }));
vi.mock('./platform', () => ({ isNativeApp: () => flags.native }));

// This jsdom build has no Web Storage.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
});

import { ensureAiConsent, needsAiConsent } from './aiConsent';
import { DialogHost } from '../components/ui/dialogs';

beforeEach(() => {
  flags.native = true;
  store.clear();
});

describe('AI consent (App Store 5.1.2(i))', () => {
  it('web: never asks', async () => {
    flags.native = false;
    expect(needsAiConsent()).toBe(false);
    await expect(ensureAiConsent()).resolves.toBe(true);
  });

  it('app: first use explains what goes where; Allow is remembered', async () => {
    render(<DialogHost />);
    expect(needsAiConsent()).toBe(true);
    let result: Promise<boolean> = Promise.resolve(false);
    act(() => { result = ensureAiConsent(); });
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toMatch(/Deepgram/);
    expect(dialog.textContent).toMatch(/Anthropic/);
    expect(dialog.textContent).toMatch(/voice|audio/i);
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await expect(result).resolves.toBe(true);
    expect(needsAiConsent()).toBe(false);
    await expect(ensureAiConsent()).resolves.toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('app: Not now cancels and asks again next time', async () => {
    render(<DialogHost />);
    let result: Promise<boolean> = Promise.resolve(true);
    act(() => { result = ensureAiConsent(); });
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    await expect(result).resolves.toBe(false);
    expect(needsAiConsent()).toBe(true);
  });
});
