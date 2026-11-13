import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../native/platform', () => ({ isNativeApp: () => true, WEB_ORIGIN: 'https://toothops.app/' }));

import { chooseDialog, confirmDialog, DialogHost, promptDialog, toast } from './dialogs';

describe('DialogHost in the iOS app', () => {
  it('confirmDialog renders an iOS alert; the destructive button is red and Cancel gets focus', async () => {
    render(<DialogHost />);
    let result: Promise<boolean> = Promise.resolve(false);
    act(() => { result = confirmDialog({ title: 'Delete visit?', message: 'This can’t be undone.', confirmLabel: 'Delete', danger: true }); });
    const alert = screen.getByRole('alertdialog', { name: 'Delete visit?' });
    expect(alert).toHaveClass('ios-alert');
    expect(document.querySelector('.ui-dialog')).toBeNull();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const del = screen.getByRole('button', { name: 'Delete' });
    expect(del).toHaveClass('ios-alert__button--destructive');
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(del);
    await expect(result).resolves.toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('a non-destructive confirm defaults to OK and resolves false on Cancel', async () => {
    render(<DialogHost />);
    let result: Promise<boolean> = Promise.resolve(true);
    act(() => { result = confirmDialog({ title: 'Replace template?' }); });
    expect(screen.getByRole('button', { name: 'OK' })).toHaveClass('ios-alert__button--default');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await expect(result).resolves.toBe(false);
  });

  it('promptDialog renders an alert with a text field', async () => {
    render(<DialogHost />);
    let result: Promise<string | null> = Promise.resolve(null);
    act(() => { result = promptDialog({ title: 'Template name', defaultValue: 'Perio' }); });
    const alert = screen.getByRole('alertdialog', { name: 'Template name' });
    expect(alert).toHaveClass('ios-alert');
    const input = screen.getByRole('textbox', { name: 'Template name' });
    fireEvent.change(input, { target: { value: 'Perio recall' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await expect(result).resolves.toBe('Perio recall');
  });

  it('prompt validation blocks confirming and shows the error', async () => {
    render(<DialogHost />);
    act(() => { void promptDialog({ title: 'Name', validate: (v) => (v ? null : 'Required') }); });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });

  it('chooseDialog with a destructive choice renders an action sheet with Cancel at the bottom', async () => {
    render(<DialogHost />);
    let result: Promise<string | null> = Promise.resolve('x');
    act(() => {
      result = chooseDialog({
        title: 'Discard changes?',
        choices: [
          { value: 'discard', label: 'Discard Changes', destructive: true },
          { value: 'keep', label: 'Keep Editing' },
        ],
      });
    });
    const sheet = screen.getByRole('alertdialog', { name: 'Discard changes?' });
    expect(sheet).toHaveClass('ios-action-sheet');
    const buttons = screen.getAllByRole('button');
    expect(buttons.at(-1)).toHaveAccessibleName('Cancel');
    expect(screen.getByRole('button', { name: 'Discard Changes' })).toHaveClass('ios-action-sheet__button--destructive');
    fireEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));
    await expect(result).resolves.toBe('discard');
  });

  it('chooseDialog resolves null on Cancel and on Escape', async () => {
    render(<DialogHost />);
    let result: Promise<string | null> = Promise.resolve('x');
    act(() => { result = chooseDialog({ title: 'Export', choices: [{ value: 'pdf', label: 'PDF' }] }); });
    fireEvent.keyDown(window, { key: 'Escape' });
    await expect(result).resolves.toBeNull();
  });

  it('toasts render as a capsule near the top with an icon close button', async () => {
    render(<DialogHost />);
    act(() => toast('Chart saved', { kind: 'success' }));
    const capsule = (await screen.findByText('Chart saved')).closest('.ios-toast');
    expect(capsule).not.toBeNull();
    expect(document.querySelector('.ios-toasts')).not.toBeNull();
    expect(document.querySelector('.ui-toasts')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByText('Chart saved')).toBeNull());
  });
});

describe('iOS dialogs: focus stays inside', () => {
  it('Tab and Shift+Tab wrap inside an alert', () => {
    render(<DialogHost />);
    act(() => { void confirmDialog({ title: 'Replace?' }); });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const ok = screen.getByRole('button', { name: 'OK' });
    ok.focus();
    fireEvent.keyDown(ok, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(ok);
  });

  it('Tab wraps inside a prompt alert', () => {
    render(<DialogHost />);
    act(() => { void promptDialog({ title: 'Name' }); });
    const input = screen.getByRole('textbox', { name: 'Name' });
    const ok = screen.getByRole('button', { name: 'OK' });
    ok.focus();
    fireEvent.keyDown(ok, { key: 'Tab' });
    expect(document.activeElement).toBe(input);
  });

  it('Tab wraps inside an action sheet', () => {
    render(<DialogHost />);
    act(() => { void chooseDialog({ title: 'Export', choices: [{ value: 'pdf', label: 'PDF' }] }); });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(cancel, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'PDF' }));
  });
});

describe('iOS action sheet on iPad', () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => { window.matchMedia = realMatchMedia; });
  function regularWidth() {
    window.matchMedia = ((q: string) => ({
      matches: q.includes('min-width: 768px'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  }

  it('with an anchor, renders as a popover next to it (no visible Cancel row)', () => {
    regularWidth();
    render(<DialogHost />);
    const anchor = { left: 600, top: 100, width: 44, height: 44, right: 644, bottom: 144, x: 600, y: 100, toJSON: () => ({}) } as DOMRect;
    act(() => { void chooseDialog({ title: 'Export', choices: [{ value: 'pdf', label: 'PDF' }], anchor }); });
    const sheet = screen.getByRole('alertdialog', { name: 'Export' });
    expect(sheet).toHaveClass('ios-action-sheet--popover');
    expect(sheet.style.top).toBe('154px'); // below the anchor, 10px gap
    expect(document.querySelector('.ios-action-sheet__cancel')).toBeNull();
    // Still a Cancel for keyboard / VoiceOver, focused first.
    expect(document.activeElement).toHaveAccessibleName('Cancel');
  });

  it('without an anchor, renders as a centred card', () => {
    regularWidth();
    render(<DialogHost />);
    act(() => { void chooseDialog({ title: 'Export', choices: [{ value: 'pdf', label: 'PDF' }] }); });
    expect(screen.getByRole('alertdialog', { name: 'Export' })).toHaveClass('ios-action-sheet--card');
  });

  it('on iPhone width, an anchor is ignored (bottom sheet)', () => {
    render(<DialogHost />);
    act(() => { void chooseDialog({ title: 'Export', choices: [{ value: 'pdf', label: 'PDF' }], anchor: document.body }); });
    expect(screen.getByRole('alertdialog', { name: 'Export' })).toHaveClass('ios-action-sheet--sheet');
  });
});
