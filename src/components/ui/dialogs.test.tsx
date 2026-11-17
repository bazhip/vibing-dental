import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import React from 'react';
import { DialogHost, toast, toastWhenReady, confirmDialog, promptDialog, chooseDialog } from './dialogs';

describe('toastWhenReady', () => {
  it('holds a toast raised before the host mounts and shows it once it does', async () => {
    toastWhenReady('Raised before the host', { kind: 'error' });
    render(<DialogHost />);
    expect(await screen.findByText('Raised before the host')).toBeInTheDocument();
  });

  it('shows straight away when the host is already mounted', async () => {
    render(<DialogHost />);
    act(() => toastWhenReady('Raised with a host'));
    expect(await screen.findByText('Raised with a host')).toBeInTheDocument();
  });

  it('plain toasts without a host are still dropped', () => {
    toast('Dropped');
    render(<DialogHost />);
    expect(screen.queryByText('Dropped')).toBeNull();
  });
});

describe('web rendering (unchanged)', () => {
  it('confirm renders the web dialog, not the iOS alert', async () => {
    const { confirmDialog } = await import('./dialogs');
    render(<DialogHost />);
    act(() => { void confirmDialog({ title: 'Delete chart?', danger: true }); });
    const dlg = screen.getByRole('alertdialog', { name: 'Delete chart?' });
    expect(dlg).toHaveClass('ui-dialog');
    expect(document.querySelector('.ios-alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'OK' })).toHaveClass('ui-btn', 'ui-btn--danger');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('ui-btn', 'ui-btn--secondary');
  });

  it('toasts keep the web markup', async () => {
    render(<DialogHost />);
    act(() => toast('Saved'));
    expect((await screen.findByText('Saved')).closest('.ui-toast')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveTextContent('×');
  });
});


describe('web dialog keyboard containment', () => {
  it.each(['confirm', 'prompt', 'choice'] as const)('keeps Tab and Shift+Tab inside %s', (kind) => {
    render(<><button>Background</button><DialogHost /></>);
    act(() => {
      if (kind === 'confirm') void confirmDialog({ title: 'Confirm action' });
      if (kind === 'prompt') void promptDialog({ title: 'Enter value' });
      if (kind === 'choice') void chooseDialog({ title: 'Choose action', choices: [{ value: 'one', label: 'First action' }] });
    });
    const dialog = screen.getByRole(kind === 'prompt' ? 'dialog' : 'alertdialog');
    const buttons = within(dialog).getAllByRole('button');
    const first = kind === 'prompt' ? within(dialog).getByRole('textbox') : buttons[0];
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });
});
