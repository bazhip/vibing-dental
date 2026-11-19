import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: { user: { email: 'session@vet.com' } } } })),
}));
vi.mock('../utils/supabaseClient', () => ({ supabase: { auth }, cloudEnabled: true }));
const native = vi.hoisted(() => ({ value: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => native.value, WEB_ORIGIN: 'https://toothops.app/' }));

import { ChartMenu } from './ChartMenu';

const cloud = {
  onPracticeSettings: vi.fn(),
  onOpenReminders: vi.fn(),
  onOpenAccount: vi.fn(),
  onSignOut: vi.fn(),
};

describe('ChartMenu', () => {
  it('leaves appearance-select navigation keys to the native control', async () => {
    const user = userEvent.setup();
    render(<ChartMenu onOpenWalkthrough={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Open settings menu' }));
    await user.click(screen.getByText('Appearance', { selector: 'summary span' }));
    const select = screen.getByRole('combobox', { name: 'Appearance' });
    select.focus();
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      expect(fireEvent.keyDown(select, { key })).toBe(true);
      expect(select).toHaveFocus();
    }
  });

  it('shows who is signed in, read from the session', async () => {
    const user = userEvent.setup();
    render(<ChartMenu onOpenWalkthrough={vi.fn()} cloud={cloud} />);
    await user.click(screen.getByRole('button', { name: 'Open settings menu' }));
    expect(await screen.findByText('session@vet.com')).toBeInTheDocument();
    expect(screen.getByText(/Signed in as/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Practice settings.*billing/i })).toBeInTheDocument();
  });

  it('prefers the email prop and hides it when signed out', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ChartMenu onOpenWalkthrough={vi.fn()} cloud={cloud} email="prop@vet.com" />);
    await user.click(screen.getByRole('button', { name: 'Open settings menu' }));
    expect(screen.getByText('prop@vet.com')).toBeInTheDocument();
    unmount();

    render(<ChartMenu onOpenWalkthrough={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Open settings menu' }));
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
  });

  it('moves between items with the arrow keys and returns focus on Escape', async () => {
    const user = userEvent.setup();
    render(<ChartMenu onOpenWalkthrough={vi.fn()} cloud={cloud} email="me@vet.com" />);
    const trigger = screen.getByRole('button', { name: 'Open settings menu' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: /Practice settings/ })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: /Recheck reminders/ })).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    // Wraps to the last item.
    expect(screen.getByRole('button', { name: /Sign out/ })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('button', { name: /Practice settings/ })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: /Practice settings/ })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('in the app, practice settings make no mention of billing', async () => {
    native.value = true;
    try {
      const user = userEvent.setup();
      render(<ChartMenu onOpenWalkthrough={vi.fn()} cloud={cloud} email="me@vet.com" />);
      await user.click(screen.getByRole('button', { name: 'Open settings menu' }));
      expect(screen.getByText('Name, logo, and team.')).toBeInTheDocument();
      expect(screen.queryByText(/billing/i)).toBeNull();
    } finally {
      native.value = false;
    }
  });
});

it('keeps help and account actions in separate menus', async () => {
  const user = userEvent.setup();
  const { unmount } = render(<ChartMenu scope="help" onOpenWalkthrough={vi.fn()} cloud={cloud} />);
  await user.click(screen.getByRole('button', { name: 'Help' }));
  expect(screen.getByRole('button', { name: /Getting started/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Practice settings/ })).toBeNull();
  unmount();
  render(<ChartMenu scope="account" onOpenWalkthrough={vi.fn()} cloud={cloud} />);
  await user.click(await screen.findByRole('button', { name: 'session@vet.com' }));
  expect(screen.getByRole('button', { name: /Account settings/ })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Practice settings/ }));
  expect(cloud.onPracticeSettings).toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'session@vet.com' }));
  expect(screen.getByRole('button', { name: /Sign out/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Getting started/ })).toBeNull();
});

it('combines practice, help, account, and visit actions in the compact More menu', async () => {
  const user = userEvent.setup();
  const onNewVisit = vi.fn(), onHistory = vi.fn(), onNewPatient = vi.fn();
  render(<ChartMenu scope="more" cloud={cloud} onOpenWalkthrough={vi.fn()} onNewPatient={onNewPatient}
    visit={{ name: 'Bella', onNewVisit, onHistory }} />);
  await user.click(screen.getByRole('button', { name: 'More' }));
  expect(screen.getByRole('button', { name: /Practice settings/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /session@vet.com/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Getting started/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Sign out/ })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /New visit/ }));
  expect(onNewVisit).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(screen.getByRole('button', { name: /Version history/ }));
  expect(onHistory).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(screen.getByRole('button', { name: /New patient/ }));
  expect(onNewPatient).toHaveBeenCalledOnce();
});

it('keeps report review reachable from the compact More menu', async () => {
  const user = userEvent.setup();
  const review = vi.fn();
  render(<ChartMenu scope="more" onOpenWalkthrough={vi.fn()} onPreviewDocuments={review} />);
  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(screen.getByRole('button', { name: /Review and export/ }));
  expect(review).toHaveBeenCalledOnce();
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

 it('loads the email before opening even when the session has a username', async () => {
  auth.getSession.mockResolvedValueOnce({ data: { session: { user: { email: 'person@example.test', user_metadata: { username: 'avery.vet', full_name: 'Avery Example' } } } } } as Awaited<ReturnType<typeof auth.getSession>>);
  render(<ChartMenu scope="account" cloud={cloud} onOpenWalkthrough={vi.fn()} />);
  const trigger = await screen.findByRole('button', { name: 'person@example.test' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  trigger.focus();
  const user = userEvent.setup();
  await user.keyboard('{ArrowUp}');
  expect(screen.getByRole('button', { name: /Sign out/ })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
 });

 it('preserves the complete email as the accessible label and tooltip', async () => {
  render(<ChartMenu scope="account" cloud={cloud} email="alexandra.montgomery@kensington-veterinary.example" onOpenWalkthrough={vi.fn()} />);
  const trigger = await screen.findByRole('button', { name: 'alexandra.montgomery@kensington-veterinary.example' });
  expect(trigger).toHaveAttribute('title', 'alexandra.montgomery@kensington-veterinary.example');
 });

 it('shows a translated account fallback while the session is loading', () => {
  auth.getSession.mockReturnValueOnce(new Promise(() => {}));
  render(<ChartMenu scope="account" cloud={cloud} onOpenWalkthrough={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Account' })).toHaveAttribute('aria-expanded', 'false');
 });

it('opens the Help Center from Help in a separate tab', () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  try {
    render(<ChartMenu scope="help" onOpenWalkthrough={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    fireEvent.click(screen.getByRole('button', { name: /ToothOps Help Center/ }));
    expect(open).toHaveBeenCalledWith(expect.stringContaining('/help/?lang=en'), '_blank', 'noopener,noreferrer');
  } finally {
    open.mockRestore();
  }
});
