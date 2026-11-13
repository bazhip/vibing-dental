import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import i18n, { loadLanguage } from '../i18n';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  resend: vi.fn(async () => ({ error: null })),
  resetPasswordForEmail: vi.fn(),
  getSession: vi.fn(async () => ({ data: { session: { user: { email: 'newvet@socal.vet' } } } })),
  getUser: vi.fn(async () => ({ data: { user: null } })),
  updateUser: vi.fn(async () => ({ error: null })),
  signOut: vi.fn(async () => ({ error: null })),
}));
const flags = vi.hoisted(() => ({ cloud: true, pricingPublic: false, paidSignup: false }));
vi.mock('../utils/supabaseClient', () => ({
  supabase: { auth },
  get cloudEnabled() {
    return flags.cloud;
  },
}));
vi.mock('../i18n/LanguageSwitcher', () => ({ LanguageSwitcher: () => <span data-testid="lang-switcher" /> }));
vi.mock('../hooks/useProfile', () => ({ uploadPracticeLogo: vi.fn() }));
// The pricing section and the plan pickers are behind feature flags; flip them per test.
vi.mock('../constants/plans', async (importOriginal) => {
  const real = await importOriginal<typeof import('../constants/plans')>();
  return Object.defineProperties({ ...real }, {
    PRICING_PUBLIC: { get: () => flags.pricingPublic, enumerable: true },
    PAID_SIGNUP: { get: () => flags.paidSignup, enumerable: true },
  });
});

import { Landing } from './Landing';
import { Login } from './Login';
import { ResetPassword } from './ResetPassword';
import { SessionExpiredOverlay } from './SessionExpiredOverlay';
import { AppLoading } from './AppLoading';
import { ErrorBoundary } from './ErrorBoundary';
import './GoogleSignInButton';
import './LandingFeatures'; // rendered inside Landing
import './LegalNotice';
import './landingTeeth';

// Fixture data and non-catalog text: the demo patient, sample codes, the brand name, and
// the crash message.
const ALLOW: (string | RegExp)[] = [
  'Biscuit',
  'ToothOps',
  'C (104)',
  'chart_biscuit_2026-07-17.pdf',
  /^(M2|G2|G1|F2|PD|PD1|PD3)$/,
  /boom/,
];
const fill = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
/** Untranslated text under `c` (legal notices included: the whole sentence is catalog text now). */
function untranslated(c: HTMLElement): string[] {
  return findUntranslated(c, ALLOW);
}

beforeEach(async () => {
  vi.clearAllMocks();
  Object.assign(flags, { cloud: true, pricingPublic: false, paidSignup: false });
  await installPseudoLocale();
});
// Inside act: components are still mounted when the language flips back.
afterEach(() => act(restoreLocale));

describe('Landing', () => {
  const view = (props: Partial<React.ComponentProps<typeof Landing>> = {}) =>
    render(<Landing onAuthenticate={vi.fn()} onTryFree={vi.fn()} {...props} />);

  it('is fully translated, including the feature dialog, lightbox and animation toggle', () => {
    const { container } = view();
    expect(untranslated(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: /^⟦Charts like a spreadsheet/ }));
    expect(untranslated(document.body)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(untranslated(document.body)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '⟦Close⟧' }));
    fireEvent.click(screen.getByRole('button', { name: /Pause animation/ }));
    expect(untranslated(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: /page one/ }));
    expect(untranslated(document.body)).toEqual([]);
  });

  it('shows the voice feature mock, and a feature without a screenshot', () => {
    const { container } = view();
    fireEvent.click(screen.getByRole('button', { name: /AI voice autofill/ }));
    expect(untranslated(document.body)).toEqual([]);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(untranslated(document.body)).toEqual([]);
    expect(untranslated(container)).toEqual([]);
  });

  it('opens the sign-in and sign-up overlays', () => {
    const { container } = view();
    fireEvent.click(screen.getByRole('button', { name: '⟦Sign in⟧' }));
    expect(untranslated(container)).toEqual([]);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: '⟦Get started⟧' }));
    expect(screen.getByRole('dialog', { name: '⟦Create your practice account⟧' })).toBeInTheDocument();
    expect(untranslated(container)).toEqual([]);
  });

  it('covers the in-app variant, the offline variant and the paid-signup pricing page', () => {
    const inApp = view({ onOpenApp: vi.fn(), onTryFree: undefined });
    expect(untranslated(inApp.container)).toEqual([]);
    inApp.unmount();
    flags.cloud = false;
    const offline = view();
    expect(untranslated(offline.container)).toEqual([]);
    offline.unmount();
    Object.assign(flags, { cloud: true, pricingPublic: true, paidSignup: true });
    const paid = view();
    expect(screen.getByText(/⟦Plans from .*\/mo · 14-day free trial/)).toBeInTheDocument();
    expect(untranslated(paid.container)).toEqual([]);
    fireEvent.click(screen.getAllByRole('button', { name: '⟦Start free trial⟧' })[0]);
    expect(untranslated(paid.container)).toEqual([]);
  });

  it('puts the language switcher in the header nav', () => {
    const { container } = view();
    expect(container.querySelector('.landing__nav [data-testid="lang-switcher"]')).not.toBeNull();
  });
});

describe('Login', () => {
  it('translates sign-in with every error state', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'Invalid login credentials' } });
    const { container } = render(<Login onAuthenticate={vi.fn()} />);
    expect(untranslated(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '⟦Forgot password?⟧' }));
    expect(untranslated(container)).toEqual([]);
    fill(/^⟦Email⟧/, 'jane@vets.com');
    fill(/^⟦Password⟧/, 'longenough');
    fireEvent.click(screen.getByRole('button', { name: '⟦Sign in⟧' }));
    await screen.findByText('⟦Incorrect email or password.⟧');
    expect(untranslated(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '⟦Show password⟧' }));
    expect(untranslated(container)).toEqual([]);
  });

  it('maps the common Supabase auth codes, and wraps anything raw', async () => {
    const cases: [{ code?: string; message: string; status?: number }, string][] = [
      [{ code: 'weak_password', message: 'Password should be at least 6 characters.' }, '⟦Choose a stronger password — at least 8 characters.⟧'],
      [{ code: 'email_address_invalid', message: 'Email address is invalid' }, '⟦Enter a valid email address.⟧'],
      [{ code: 'user_already_exists', message: 'User already registered' }, '⟦An account with this email already exists.⟧'],
      [{ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }, '⟦Too many attempts. Wait a minute and try again.⟧'],
      [{ code: 'same_password', message: 'New password should be different from the old password.' }, '⟦Choose a new password that’s different from your current one.⟧'],
      [{ message: 'Database error querying schema' }, '⟦Something went wrong (details: Database error querying schema)⟧'],
    ];
    for (const [error, shown] of cases) {
      auth.signInWithPassword.mockResolvedValue({ error });
      const { container, unmount } = render(<Login onAuthenticate={vi.fn()} />);
      fill(/^⟦Email⟧/, 'jane@vets.com');
      fill(/^⟦Password⟧/, 'longenough');
      fireEvent.click(screen.getByRole('button', { name: '⟦Sign in⟧' }));
      await screen.findByText(shown);
      expect(untranslated(container)).toEqual([]);
      unmount();
    }
  });

  it('translates the unconfirmed-email and reset-link notices', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: 'email_not_confirmed', message: 'Email not confirmed' } });
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    const { container } = render(<Login onAuthenticate={vi.fn()} />);
    fill(/^⟦Email⟧/, 'jane@vets.com');
    fill(/^⟦Password⟧/, 'longenough');
    fireEvent.click(screen.getByRole('button', { name: '⟦Sign in⟧' }));
    await screen.findByText(/Confirm your email first/);
    expect(untranslated(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '⟦Resend confirmation email⟧' }));
    await screen.findByText(/Confirmation email sent to/);
    expect(untranslated(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '⟦Forgot password?⟧' }));
    await screen.findByText(/a password reset link is on its way/);
    expect(untranslated(container)).toEqual([]);
  });

  it('translates sign-up, its validation errors, and the existing-account state', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    const { container } = render(<Login onAuthenticate={vi.fn()} initialMode="signup" />);
    expect(untranslated(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '⟦Create account⟧' }));
    await screen.findByText(/Practice and doctor name are required/);
    fill(/Practice name/, 'Smile Vets');
    fill(/Doctor name/, 'Dr. Jane');
    fill(/^⟦Email⟧/, 'jane@vets.com');
    fill(/^⟦Password⟧/, 'short');
    expect(untranslated(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '⟦Create account⟧' }));
    await screen.findByText(/Password must be at least 8 characters/);
    fill(/^⟦Password⟧/, 'longenough');
    fireEvent.click(screen.getByRole('button', { name: '⟦Create account⟧' }));
    await screen.findByText(/already exists/);
    expect(untranslated(container)).toEqual([]);
    expect(screen.getByRole('button', { name: '⟦Sign in instead⟧' })).toBeInTheDocument();
  });

  it('translates the plan pickers shown when paid signup is on', () => {
    flags.paidSignup = true;
    const { container } = render(<Login onAuthenticate={vi.fn()} initialMode="signup" initialPlan="practice_pro" />);
    expect(untranslated(container)).toEqual([]);
    fireEvent.click(screen.getByLabelText(/Pro ·/));
    expect(untranslated(container)).toEqual([]);
  });

  it('translates the check-your-inbox screen (with and without the trial line)', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    flags.paidSignup = true;
    const { container } = render(<Login onAuthenticate={vi.fn()} initialMode="signup" />);
    fill(/Practice name/, 'Smile Vets');
    fill(/Doctor name/, 'Dr. Jane');
    fill(/^⟦Email⟧/, 'jane@vets.com');
    fill(/^⟦Password⟧/, 'longenough');
    fireEvent.click(screen.getByRole('button', { name: '⟦Create account⟧' }));
    await screen.findByText('⟦Check your inbox⟧');
    expect(untranslated(container)).toEqual([]);
    expect(screen.getByText(/jane@vets\.com/)).toBeInTheDocument();
    expect(screen.getByText(/ToothOps <noreply@toothops\.app>/)).toBeInTheDocument();
  });

  it('translates the standalone password screen and a wrong password', () => {
    flags.cloud = false;
    const { container } = render(<Login onAuthenticate={vi.fn()} />);
    expect(untranslated(container)).toEqual([]);
    fireEvent.change(container.querySelector('input[type="password"]')!, { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: '⟦Continue⟧' }));
    expect(untranslated(container)).toEqual([]);
    expect(screen.getByRole('alert')).toHaveTextContent('⟦Incorrect password⟧');
  });

  it('translates a Google sign-in failure', async () => {
    auth.signInWithOAuth.mockResolvedValue({ error: new Error('') });
    const { container } = render(<Login onAuthenticate={vi.fn()} initialMode="signup" />);
    fireEvent.click(screen.getByRole('button', { name: '⟦Sign up with Google⟧' }));
    await screen.findByText('⟦Couldn’t start Google sign-in.⟧');
    expect(untranslated(container)).toEqual([]);
  });

  it('puts the language switcher in the card header', () => {
    const { container } = render(<Login onAuthenticate={vi.fn()} />);
    expect(container.querySelector('.login-header [data-testid="lang-switcher"]')).not.toBeNull();
  });
});

describe('ResetPassword', () => {
  it('translates the invite and recovery screens and their errors', async () => {
    const { container, unmount } = render(<ResetPassword mode="invite" onDone={vi.fn()} />);
    await screen.findByText(/newvet@socal\.vet/);
    expect(untranslated(container)).toEqual([]);
    unmount();
    const rec = render(<ResetPassword onDone={vi.fn()} />);
    await screen.findByText(/newvet@socal\.vet/);
    fireEvent.change(screen.getByLabelText('⟦New password⟧'), { target: { value: 'short' } });
    fireEvent.submit(rec.container.querySelector('form')!);
    expect(untranslated(rec.container)).toEqual([]);
    fireEvent.change(screen.getByLabelText('⟦New password⟧'), { target: { value: 'longenough' } });
    fireEvent.change(screen.getByLabelText('⟦Confirm new password⟧'), { target: { value: 'different1' } });
    fireEvent.submit(rec.container.querySelector('form')!);
    expect(screen.getByRole('alert')).toHaveTextContent('⟦The two passwords don’t match.⟧');
    fireEvent.click(screen.getByRole('button', { name: '⟦Show passwords⟧' }));
    expect(untranslated(rec.container)).toEqual([]);
  });
});

describe('SessionExpiredOverlay', () => {
  it('translates the overlay and a failed sign-in', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'x' } });
    render(<SessionExpiredOverlay email="jane@vets.com" onSignOut={vi.fn()} />);
    expect(untranslated(document.body)).toEqual([]);
    fireEvent.change(screen.getByLabelText('⟦Password⟧'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '⟦Sign in and continue charting⟧' }));
    await screen.findByText('⟦Incorrect email or password.⟧');
    expect(untranslated(document.body)).toEqual([]);
  });
});

describe('AppLoading and ErrorBoundary', () => {
  it('translates the loading indicator', async () => {
    const { container } = render(<AppLoading />);
    await waitFor(() => expect(container.querySelector('.app-loading')).not.toBeNull());
    expect(untranslated(container)).toEqual([]);
  });

  it('translates the crash screen', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Boom = (): never => {
      throw new Error('boom');
    };
    const { container } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(untranslated(container)).toEqual([]);
    spy.mockRestore();
  });
});

describe('in French', () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });

  it('formats the plan prices with the French currency format', async () => {
    flags.paidSignup = true;
    await loadLanguage('fr');
    await act(() => i18n.changeLanguage('fr'));
    render(<Login onAuthenticate={vi.fn()} initialMode="signup" />);
    expect(screen.getByText(/Vous seul\(e\)\. À partir de 20\s\$\/mois\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer le compte' })).toBeInTheDocument();
  });
});
