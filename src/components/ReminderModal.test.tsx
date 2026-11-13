import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const flags = vi.hoisted(() => ({ native: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => flags.native, WEB_ORIGIN: 'https://toothops.app/' }));
const invoke = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => ({ data: {}, error: null })));
vi.mock('../utils/supabaseClient', () => ({ supabase: { functions: { invoke } }, cloudEnabled: true }));
vi.mock('../hooks/useReminderTemplate', async (orig) => ({
  ...(await orig<typeof import('../hooks/useReminderTemplate')>()),
  useReminderTemplate: () => ({
    template: { subject: 'Recheck for {{patient}}', body: 'Hi {{owner}}, {{patient}} is due.', auto: false, leadDays: 0 },
    loaded: true,
  }),
}));
const chooseDialog = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => 'discard' as string | null));
vi.mock('./ui/dialogs', async (orig) => ({
  ...(await orig<typeof import('./ui/dialogs')>()),
  chooseDialog: (...a: unknown[]) => chooseDialog(...a),
}));

import { ReminderModal } from './ReminderModal';

const props = {
  practiceId: 'p1', practiceName: 'SoCal Vet', chartId: 'c1', toEmail: 'owner@example.com',
  patientName: 'Bella', ownerName: 'Sam', recheckDate: 'Dec 1',
};

beforeEach(() => {
  flags.native = false;
  invoke.mockClear();
  chooseDialog.mockClear();
});

describe('ReminderModal — website (unchanged)', () => {
  it('is the centred modal with To / Subject / Message and Cancel + Send reminder in the footer', () => {
    render(<ReminderModal open onClose={vi.fn()} {...props} />);
    expect(document.querySelector('.ai-settings-overlay .ai-settings-modal')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Send recheck reminder' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^To/)).toHaveValue('owner@example.com');
    expect(screen.getByLabelText(/^Subject/)).toHaveValue('Recheck for Bella');
    expect(document.querySelector('.ai-settings-footer')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Send reminder' })).toBeInTheDocument();
    expect(document.querySelector('.ios-sheet')).toBeNull();
  });
});

describe('ReminderModal — iOS app', () => {
  beforeEach(() => { flags.native = true; });

  it('is a compose sheet: grabber, Cancel leading, Send trailing, grouped fields', () => {
    render(<ReminderModal open onClose={vi.fn()} {...props} />);
    const sheet = screen.getByRole('dialog', { name: 'Send recheck reminder' });
    expect(sheet).toHaveClass('ios-sheet');
    expect(document.querySelector('.ios-sheet__grabber')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(document.querySelector('.ai-settings-footer')).toBeNull();
    expect(sheet.querySelector('.ios-form-group')).not.toBeNull();
    expect(screen.getByLabelText(/^Subject/)).toHaveValue('Recheck for Bella');
  });

  it('Cancel with no edits closes without asking', async () => {
    const onClose = vi.fn();
    render(<ReminderModal open onClose={onClose} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(chooseDialog).not.toHaveBeenCalled();
  });

  it('Cancel after editing asks to discard first', async () => {
    const onClose = vi.fn();
    chooseDialog.mockResolvedValueOnce(null);
    render(<ReminderModal open onClose={onClose} {...props} />);
    fireEvent.change(screen.getByLabelText(/^Subject/), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(chooseDialog).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('Send sends through the edge function', async () => {
    render(<ReminderModal open onClose={vi.fn()} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('send-reminder', expect.objectContaining({
      body: expect.objectContaining({ to: 'owner@example.com', subject: 'Recheck for Bella', chartId: 'c1' }),
    })));
    expect(await screen.findByText('Reminder sent.')).toBeInTheDocument();
  });
});
