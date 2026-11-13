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
const browser = vi.hoisted(() => ({ open: vi.fn(async () => {}), close: vi.fn(async () => {}) }));
vi.mock('@capacitor/browser', () => ({ Browser: browser }));
const cap = vi.hoisted(() => ({ native: false }));
vi.mock('@capacitor/core', async (orig) => ({
  ...(await orig<typeof import('@capacitor/core')>()),
  Capacitor: { isNativePlatform: () => cap.native, getPlatform: () => (cap.native ? 'ios' : 'web') },
}));

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

describe('Login — Sign in with Apple and app mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cap.native = false;
    vi.unstubAllEnvs();
  });

  const APPLE_HINT = 'Already have an account or were invited? Sign in with your email.';

  it('web, flag unset: no Apple button or hint (as before); Google and sign-up unchanged', () => {
    render(<Login onAuthenticate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /with Apple/ })).toBeNull();
    expect(screen.queryByText(APPLE_HINT)).toBeNull();
    expect(screen.getByRole('button', { name: 'New here? Create a practice account' })).toBeInTheDocument();
    expect(screen.queryByText('New to ToothOps? Sign up at toothops.app')).toBeNull();
  });

  it('web, VITE_APPLE_SIGNIN_WEB=true: Apple sits beside Google, with the hint', () => {
    vi.stubEnv('VITE_APPLE_SIGNIN_WEB', 'true');
    render(<Login onAuthenticate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeInTheDocument();
    expect(screen.getByText(APPLE_HINT)).toBeInTheDocument();
  });

  it('appMode: sign-in only, with a link to sign up on the website', async () => {
    // The app always shows Apple (App Store 4.8), flag or not.
    cap.native = true;
    render(<Login onAuthenticate={vi.fn()} appMode initialMode="signup" />);
    expect(screen.queryByRole('button', { name: /Create account|Create a practice account|Sign up/ })).toBeNull();
    expect(screen.queryByLabelText(/Practice name/)).toBeNull();
    expect(screen.queryByText(/\$\d/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeInTheDocument();
    expect(screen.getByText(APPLE_HINT)).toBeInTheDocument();
    const link = screen.getByText('New to ToothOps? Sign up at toothops.app');
    fireEvent.click(link);
    await waitFor(() => expect(browser.open).toHaveBeenCalledWith({ url: 'https://toothops.app/' }));
  });

  it('web: the website form (labelled fields, login buttons); no iOS styling', () => {
    render(<Login onAuthenticate={vi.fn()} />);
    expect(document.querySelector('.login-container')).not.toHaveClass('login-container--app');
    expect(screen.getByLabelText(/^Email/).closest('.login-field')).not.toBeNull();
    expect(document.querySelector('.ios-form-group')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveClass('login-button');
  });

  it('appMode: inset-grouped Email / Password fields and iOS buttons', () => {
    cap.native = true;
    render(<Login onAuthenticate={vi.fn()} appMode />);
    expect(document.querySelector('.login-container')).toHaveClass('login-container--app');
    const group = document.querySelector('.ios-form-group')!;
    expect(group).not.toBeNull();
    expect(group.contains(screen.getByLabelText(/^Email/))).toBe(true);
    expect(group.contains(screen.getByLabelText(/^Password/))).toBe(true);
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveClass('ios-button', 'ios-button--filled');
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toHaveClass('ios-button', 'ios-button--plain');
    expect(screen.getByText('New to ToothOps? Sign up at toothops.app')).toHaveClass('ios-button--plain');
    expect(screen.getByText('Already have an account or were invited? Sign in with your email.')).toBeInTheDocument();
  });
});
