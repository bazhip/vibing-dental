import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Send feedback from the dictation panel in the iOS app: an iOS compose
// sheet (Cancel leading, Send trailing), asking before discarding typed
// text, with the transcript offered as on the website.
const native = vi.hoisted(() => ({ on: true }));
vi.mock('../native/platform', () => ({ isNativeApp: () => native.on }));
const invoke = vi.hoisted(() => vi.fn());
vi.mock('../utils/supabaseClient', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
const chooseDialog = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => 'discard' as string | null));
vi.mock('./ui/dialogs', async (orig) => ({
  ...(await orig<typeof import('./ui/dialogs')>()),
  toast: vi.fn(),
  chooseDialog: (...a: unknown[]) => chooseDialog(...a),
}));

import { FeedbackModal } from './FeedbackModal';

beforeEach(() => {
  invoke.mockReset();
  chooseDialog.mockClear();
});
afterEach(() => { native.on = true; });

const sheetButtons = () => Array.from(document.querySelectorAll<HTMLElement>('.ios-sheet button'));

describe('Send feedback in the iOS app', () => {
  it('is a sheet: Cancel leading, Send trailing, no web footer', () => {
    render(<FeedbackModal onClose={() => {}} section="charting" />);
    const sheet = screen.getByRole('dialog', { name: 'Send feedback' });
    expect(sheet).toHaveClass('ios-sheet');
    expect(document.querySelector('.ai-settings-overlay')).toBeNull();
    expect(document.querySelector('.ai-settings-footer')).toBeNull();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const send = screen.getByRole('button', { name: 'Send' });
    const order = sheetButtons();
    expect(order.indexOf(cancel)).toBeLessThan(order.indexOf(send));
    // Send needs a message.
    expect(send).toBeDisabled();
  });

  it('keeps the dictation transcript, attached by default, and Send sends it', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const onClose = vi.fn();
    render(<FeedbackModal onClose={onClose} section="charting" transcript="[10:00] 104 GI 2" />);
    expect(screen.getByRole('checkbox', { name: /Include my dictation transcript/ })).toBeChecked();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '104 came out wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [fn, { body }] = invoke.mock.calls[0];
    expect(fn).toBe('send-feedback');
    expect(body).toMatchObject({ message: '104 came out wrong', transcript: '[10:00] 104 GI 2', context: { section: 'charting' } });
  });

  it('Cancel with nothing typed closes without asking', async () => {
    const onClose = vi.fn();
    render(<FeedbackModal onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(chooseDialog).not.toHaveBeenCalled();
  });

  it('Cancel after typing asks to discard first', async () => {
    const onClose = vi.fn();
    chooseDialog.mockResolvedValueOnce(null);
    render(<FeedbackModal onClose={onClose} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'half a thought' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(chooseDialog).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveValue('half a thought');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('a server error shows in the sheet, which stays open', async () => {
    invoke.mockResolvedValue({ data: { error: 'Please try again tomorrow.' }, error: null });
    const onClose = vi.fn();
    render(<FeedbackModal onClose={onClose} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please try again tomorrow.');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the website keeps its modal', () => {
    native.on = false;
    render(<FeedbackModal onClose={() => {}} />);
    expect(document.querySelector('.ai-settings-overlay')).not.toBeNull();
    expect(document.querySelector('.ios-sheet')).toBeNull();
  });
});
