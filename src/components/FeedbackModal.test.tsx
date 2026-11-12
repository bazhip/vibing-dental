import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

const invoke = vi.fn();
vi.mock('../utils/supabaseClient', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock('./ui/dialogs', () => ({ toast: vi.fn() }));

import { FeedbackModal } from './FeedbackModal';

beforeEach(() => invoke.mockReset());

describe('FeedbackModal', () => {
  it('sends the message, kind and page, then closes', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const onClose = vi.fn();
    render(<FeedbackModal onClose={onClose} section="charting" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Idea' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Add a dark mode' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [fn, { body }] = invoke.mock.calls[0];
    expect(fn).toBe('send-feedback');
    expect(body).toMatchObject({ kind: 'idea', message: 'Add a dark mode', transcript: '', context: { section: 'charting' } });
  });

  it('attaches the dictation transcript by default, and can leave it off', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    render(<FeedbackModal onClose={() => {}} transcript="[10:00] 104 GI 2" />);
    const box = screen.getByRole('checkbox', { name: /Include my dictation transcript/ });
    expect(box).toBeChecked();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '104 came out wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke.mock.calls[0][1].body.transcript).toBe('[10:00] 104 GI 2');

    invoke.mockClear();
  });

  it('no transcript option when there is none; Send needs a message', () => {
    render(<FeedbackModal onClose={() => {}} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('shows the server error and stays open', async () => {
    invoke.mockResolvedValue({ data: { error: 'Please try again tomorrow.' }, error: null });
    const onClose = vi.fn();
    render(<FeedbackModal onClose={onClose} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please try again tomorrow.');
    expect(onClose).not.toHaveBeenCalled();
  });
});
