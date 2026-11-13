import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resend: vi.fn(async () => ({ error: null })),
  resetPasswordForEmail: vi.fn(),
}));
vi.mock('../utils/supabaseClient', () => ({ supabase: { auth }, cloudEnabled: true }));
vi.mock('../hooks/useProfile', () => ({ uploadPracticeLogo: vi.fn() }));

import { Login } from './Login';

const fill = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('Login — signup confirmation flow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('after signup, shows a check-your-inbox screen instead of the sign-in form', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    render(<Login onAuthenticate={vi.fn()} initialMode="signup" />);
    fill(/Practice name/, 'Smile Vets');
    fill(/Doctor name/, 'Dr. Jane');
    fill(/^Email/, 'jane@vets.com');
    fill(/^Password/, 'longenough');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Check your inbox');
    expect(screen.getByText('jane@vets.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resend email/ })).toBeDisabled(); // cooldown
  });

  it('signup records the language so the confirmation email is localized', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    render(<Login onAuthenticate={vi.fn()} initialMode="signup" />);
    fill(/Practice name/, 'Smile Vets');
    fill(/Doctor name/, 'Dr. Jane');
    fill(/^Email/, 'jane@vets.com');
    fill(/^Password/, 'longenough');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Check your inbox');
    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ data: expect.objectContaining({ language: 'en' }) }) }),
    );
  });

  it('an unconfirmed sign-in explains it and offers to resend — not "wrong password"', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: 'email_not_confirmed', message: 'Email not confirmed' } });
    render(<Login onAuthenticate={vi.fn()} />);
    fill(/^Email/, 'jane@vets.com');
    fill(/^Password/, 'longenough');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText(/Confirm your email first/);
    expect(screen.queryByText(/Incorrect/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resend confirmation email' }));
    await waitFor(() => expect(auth.resend).toHaveBeenCalledWith(expect.objectContaining({ type: 'signup', email: 'jane@vets.com' })));
  });

  it('signing up with an existing email says so and offers sign-in', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    render(<Login onAuthenticate={vi.fn()} initialMode="signup" />);
    fill(/Practice name/, 'Smile Vets');
    fill(/Doctor name/, 'Dr. Jane');
    fill(/^Email/, 'jane@vets.com');
    fill(/^Password/, 'longenough');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText(/already exists/);
    expect(screen.getByRole('button', { name: 'Sign in instead' })).toBeInTheDocument();
  });
});
