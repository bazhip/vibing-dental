import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: { user: { email: 'session@vet.com' } } } })),
}));
vi.mock('../utils/supabaseClient', () => ({ supabase: { auth }, cloudEnabled: true }));

import { ChartMenu } from './ChartMenu';

const cloud = {
  onPracticeSettings: vi.fn(),
  onOpenReminders: vi.fn(),
  onOpenAccount: vi.fn(),
  onSignOut: vi.fn(),
};

describe('ChartMenu', () => {
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
});
