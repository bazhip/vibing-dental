import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const flags = vi.hoisted(() => ({ native: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => flags.native, WEB_ORIGIN: 'https://toothops.app/' }));
const invoke = vi.hoisted(() =>
  vi.fn(async (_fn: string, opts: { body: Record<string, unknown> }) =>
    opts.body.preview ? { data: { practiceName: 'SoCal Vet', alreadyMember: false }, error: null } : { data: {}, error: null }
  )
);
vi.mock('../utils/supabaseClient', () => ({ supabase: { functions: { invoke } }, cloudEnabled: true }));

import { JoinPracticeModal } from './JoinPracticeModal';

beforeEach(() => {
  flags.native = false;
  invoke.mockClear();
});

describe('JoinPracticeModal — website', () => {
  it('is the centred modal with Not now / Join in the footer', async () => {
    render(<JoinPracticeModal token="t1" onDone={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Join SoCal Vet?' })).toBeInTheDocument();
    expect(document.querySelector('.ai-settings-overlay .ai-settings-footer')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join SoCal Vet' })).toBeInTheDocument();
    expect(document.querySelector('.ios-sheet')).toBeNull();
  });
});

describe('JoinPracticeModal — iOS app', () => {
  beforeEach(() => { flags.native = true; });

  it('is a sheet: Not now leading, Join trailing, the share choice as a checkbox', async () => {
    const onDone = vi.fn();
    render(<JoinPracticeModal token="t1" onDone={onDone} />);
    const sheet = await screen.findByRole('dialog', { name: 'Join SoCal Vet?' });
    expect(sheet).toHaveClass('ios-sheet');
    expect(document.querySelector('.ios-sheet__grabber')).not.toBeNull();
    expect(document.querySelector('.ai-settings-footer')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Also share the charts I’ve already made' }));
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
    expect(invoke).toHaveBeenLastCalledWith('team-api', { body: { action: 'accept_invite', token: 't1', shareExisting: true } });
  });

  it('Not now (or swiping it away) declines', async () => {
    const onDone = vi.fn();
    render(<JoinPracticeModal token="t1" onDone={onDone} />);
    await screen.findByRole('dialog', { name: 'Join SoCal Vet?' });
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(false));
  });
});

describe('JoinPracticeModal — a failed join', () => {
  it('shows the error and can be retried (the Join button stays)', async () => {
    flags.native = false;
    const onDone = vi.fn();
    invoke.mockImplementationOnce(async () => ({ data: { practiceName: 'SoCal Vet', alreadyMember: false }, error: null })) // preview
      .mockImplementationOnce((async () => ({ data: { error: 'Server busy' }, error: null })) as never); // first join
    render(<JoinPracticeModal token="t1" onDone={onDone} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Join SoCal Vet' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Join SoCal Vet' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
  });
});
