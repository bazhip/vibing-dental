import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
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
