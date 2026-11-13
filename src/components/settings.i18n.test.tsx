import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import i18n, { loadLanguage } from '../i18n';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import type { UseTeamReturn, TeamMember } from '../hooks/useTeam';
import type { BillingInfo } from '../hooks/useBilling';
import type { UseProfileReturn } from '../hooks/useProfile';
import { DEFAULT_CHART_PREFS } from '../utils/chartSettings';
import { formatPlanPrice } from '../constants/plans';
import { downloadHint, inAppBrowserMessage } from '../utils/savePdf';

const teamState = vi.hoisted(() => ({ current: null as unknown as UseTeamReturn }));
const billingMock = vi.hoisted(() => ({
  info: null as unknown as BillingInfo,
  fetchBilling: vi.fn(),
  openBillingPortal: vi.fn(),
  changePlan: vi.fn(),
  startCheckout: vi.fn(),
}));
const authMock = vi.hoisted(() => ({ role: 'user', signOut: vi.fn() }));
const invoke = vi.hoisted(() => vi.fn());
const dialogs = vi.hoisted(() => ({ confirmDialog: vi.fn(async () => true), toast: vi.fn() }));

vi.mock('../utils/supabaseClient', () => ({
  cloudEnabled: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { app_metadata: { role: authMock.role } } } } }),
      getUser: async () => ({ data: { user: { email: 'me@vet.com' } } }),
      updateUser: async () => ({ error: null }),
      signOut: authMock.signOut,
    },
    functions: { invoke },
  },
}));
const langMock = vi.hoisted(() => ({ language: 'en', save: vi.fn(async () => {}) }));
vi.mock('../hooks/usePracticeLanguage', () => ({
  usePracticeLanguage: () => ({ language: langMock.language, explicit: false, loaded: true, save: langMock.save }),
}));
vi.mock('../hooks/useTeam', () => ({ useTeam: () => teamState.current }));
vi.mock('../hooks/useBilling', async (orig) => ({
  ...(await orig<typeof import('../hooks/useBilling')>()),
  fetchBilling: billingMock.fetchBilling,
  openBillingPortal: billingMock.openBillingPortal,
  changePlan: billingMock.changePlan,
  startCheckout: billingMock.startCheckout,
}));
vi.mock('./OwnerReportTemplatesModal', () => ({ OwnerReportTemplatesModal: () => <div /> }));
vi.mock('./ui/dialogs', async (orig) => ({
  ...(await orig<typeof import('./ui/dialogs')>()),
  confirmDialog: dialogs.confirmDialog,
  toast: dialogs.toast,
}));
// The gate applies the account's language; these tests pick the language themselves.
vi.mock('../i18n/AccountLanguage', () => ({ AccountLanguage: () => null }));
vi.mock('../utils/accountDeletion', () => ({ deleteMyPractice: vi.fn() }));
// The PDF itself is plan 3: stub the generator, keep the preview chrome.
vi.mock('../utils/pdfGenerator', () => ({ buildDentalChartPDFBytes: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));
vi.mock('../utils/svgToPng', () => ({ diagramSvgToPng: vi.fn(async () => new Uint8Array()) }));
vi.mock('../hooks/useAttachments', () => ({ listChartAttachments: vi.fn(async () => null) }));

import { PracticeSettingsModal, roleLabel } from './PracticeSettingsModal';
import { ChartSettingsModal } from './ChartSettingsModal';
import { BillingGate } from './BillingGate';
import { FinishSetupModal } from './FinishSetupModal';
import { JoinPracticeModal } from './JoinPracticeModal';
import { FeedbackModal } from './FeedbackModal';
import { WalkthroughModal } from './WalkthroughModal';
import { PdfStylePicker } from './PdfStylePicker';
import { PdfPreviewModal, type ChartSnapshot } from './PdfPreviewModal';
import { PdfLinkPanel } from './PdfLinkPanel';
import { PdfPagesPreview } from './PdfPagesPreview';
import { AccountModal } from './AccountModal';
import { LANGUAGE_NAMES } from '../i18n/config';

beforeAll(() => {
  window.ResizeObserver = window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  URL.createObjectURL = URL.createObjectURL ?? (() => 'blob:x');
  URL.revokeObjectURL = URL.revokeObjectURL ?? (() => {});
});

const member = (over: Partial<TeamMember>): TeamMember => ({
  userId: 'u', email: 'x@vet.com', doctorName: '', role: 'member', isYou: false, pending: false, isPrimaryOwner: false, ...over,
});
const makeTeam = (over: Partial<UseTeamReturn> = {}): UseTeamReturn => ({
  enabled: true, loaded: true, error: '', practice: { id: 'p1', name: 'Elm Vet' }, role: 'owner', primaryOwnerId: 'me',
  members: [
    member({ userId: 'me', email: 'me@vet.com', doctorName: 'Dr Kaser', role: 'owner', isYou: true, isPrimaryOwner: true }),
    member({ userId: 'm1', email: 'joined@vet.com' }),
    member({ userId: 'm2', email: 'pending@vet.com', pending: true }),
    member({ userId: 'm3', email: 'second@vet.com', role: 'owner' }),
  ],
  refresh: vi.fn().mockResolvedValue(undefined), createPractice: vi.fn(), addMember: vi.fn().mockResolvedValue('invited'),
  resendInvite: vi.fn().mockResolvedValue(undefined), removeMember: vi.fn().mockResolvedValue(undefined),
  setRole: vi.fn().mockResolvedValue(undefined), transferOwnership: vi.fn().mockResolvedValue(undefined),
  ...over,
});
const billing = (over: Partial<BillingInfo> = {}): BillingInfo => ({
  practice: { id: 'p1', name: 'Elm Vet' }, role: 'owner', plan: 'basic', accountType: 'individual', status: 'none',
  periodEnd: null, frozenAt: null, seats: 1, memberCount: 3, hasStripe: false, ownerEmail: 'boss@vet.com',
  intendedPlan: 'individual_basic', ...over,
});
const profile = (over: Partial<UseProfileReturn> = {}) => ({
  practiceName: 'Elm Vet', doctorName: 'Dr Kaser', logoUrl: '', ownerReportEnabled: true,
  update: vi.fn().mockResolvedValue(undefined), uploadLogo: vi.fn().mockResolvedValue(undefined), removeLogo: vi.fn().mockResolvedValue(undefined),
  ...over,
}) as unknown as UseProfileReturn;

beforeEach(async () => {
  teamState.current = makeTeam();
  billingMock.info = billing();
  billingMock.fetchBilling.mockImplementation(async () => billingMock.info);
  billingMock.openBillingPortal.mockResolvedValue(undefined);
  billingMock.changePlan.mockResolvedValue(undefined);
  authMock.role = 'user';
  invoke.mockReset();
  dialogs.confirmDialog.mockClear();
  dialogs.toast.mockClear();
  await installPseudoLocale();
});
afterEach(async () => {
  cleanup();
  await restoreLocale();
  window.history.replaceState({}, '', '/');
});

// Names, emails, the typed practice name and plan-neutral fixture data.
const ALLOW: (string | RegExp)[] = [
  'Elm Vet', 'Dr Kaser', 'Dr. Ann Lee', 'Ann Lee', 'me@vet.com', 'joined@vet.com', 'pending@vet.com', 'second@vet.com',
  'boss@vet.com', 'a@b.co', 'logo.png', 'ToothOps', 'Bella', 'Stripe',
  /^me@vet\.com|^joined@vet\.com|^pending@vet\.com|^second@vet\.com/,
  /^\d+\/\d+$/,
];
// Drug names in the datalist are generic names, not interface text.
const DRUGS = ['Bupivacaine', 'Ropivacaine', 'Lidocaine', 'Mepivacaine'];

describe('PracticeSettingsModal', () => {
  it('owners pick the pet-owner language; members see it read-only', async () => {
    langMock.save.mockClear();
    const { container, unmount } = render(<PracticeSettingsModal open onClose={() => {}} profile={profile()} />);
    const select = (await screen.findByLabelText('⟦Language for pet owners⟧')) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['en', 'es', 'fr', 'de', 'it', 'pt']);
    fireEvent.change(select, { target: { value: 'fr' } });
    await waitFor(() => expect(langMock.save).toHaveBeenCalledWith('fr'));
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    unmount();

    teamState.current = makeTeam({ role: 'member' });
    render(<PracticeSettingsModal open onClose={() => {}} profile={profile()} />);
    await screen.findByText('⟦Language for pet owners⟧');
    expect(screen.queryByLabelText('⟦Language for pet owners⟧')).toBeNull();
    expect(screen.getByTestId('client-language-readonly').textContent).toBe('⟦English⟧');
  });

  it('language names follow the app language', async () => {
    await loadLanguage('fr');
    await i18n.changeLanguage('fr');
    langMock.language = 'es';
    try {
      const { unmount } = render(<PracticeSettingsModal open onClose={() => {}} profile={profile()} />);
      const select = (await screen.findByLabelText('Langue pour les propriétaires d’animaux')) as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => o.textContent)).toContain('Español (espagnol)');
      unmount();
      teamState.current = makeTeam({ role: 'member' });
      render(<PracticeSettingsModal open onClose={() => {}} profile={profile()} />);
      expect((await screen.findByTestId('client-language-readonly')).textContent).toBe('Español (espagnol)');
    } finally {
      langMock.language = 'en';
    }
  });

  it('owner with a team, free beta billing and the delete section', async () => {
    const { container } = render(<PracticeSettingsModal open onClose={() => {}} profile={profile()} />);
    await screen.findByText('⟦Free beta⟧', { exact: false });
    expect(findUntranslated(container, ALLOW)).toEqual([]);
  });

  it('live subscription with a plan picker, a trial date, a draft name and an error', async () => {
    billingMock.info = billing({ status: 'trialing', hasStripe: true, periodEnd: '2026-12-01T00:00:00Z', accountType: 'practice', plan: 'pro', seats: 5 });
    const { container } = render(<PracticeSettingsModal open onClose={() => {}} profile={profile({ logoUrl: 'https://x/logo.png' })} />);
    await screen.findByLabelText('⟦Change plan⟧');
    fireEvent.change(screen.getByPlaceholderText('⟦Shown in the app and on every chart⟧'), { target: { value: 'Elm Vet 2' } });
    fireEvent.click(await screen.findByRole('button', { name: '⟦Make owner⟧' }));
    expect(findUntranslated(container, [...ALLOW, 'Elm Vet 2'])).toEqual([]);
  });

  it('every billing status', async () => {
    for (const status of ['active', 'past_due', 'canceled', 'comped']) {
      billingMock.info = billing({ status, hasStripe: true, periodEnd: '2026-12-01T00:00:00Z' });
      const { container, unmount } = render(<PracticeSettingsModal open onClose={() => {}} profile={profile()} />);
      await waitFor(() => expect(container.textContent).toMatch(/⟦(Billing|Manage billing)/));
      await screen.findByRole('heading', { name: '⟦Billing⟧' });
      await waitFor(() => expect(billingMock.fetchBilling).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(findUntranslated(container, ALLOW)).toEqual([]);
      unmount();
    }
  });

  it('as a member, with a billing load error, and with the team failing to load', async () => {
    teamState.current = makeTeam({ role: 'member', members: [member({ userId: 'me', email: 'me@vet.com', isYou: true }), member({ userId: 'o', email: 'second@vet.com', role: 'owner', isPrimaryOwner: true })], primaryOwnerId: 'o' });
    billingMock.info = billing({ role: 'member', status: 'active', accountType: 'practice' });
    const first = render(<PracticeSettingsModal open onClose={() => {}} profile={profile()} />);
    await screen.findByText('⟦Billing is managed by ', { exact: false });
    expect(findUntranslated(first.container, ALLOW)).toEqual([]);
    first.unmount();

    billingMock.fetchBilling.mockRejectedValue(new Error('boom'));
    teamState.current = makeTeam({ error: 'Nope', practice: null, role: null, members: [] });
    const second = render(<PracticeSettingsModal open onClose={() => {}} profile={profile()} />);
    await screen.findByText('boom');
    expect(findUntranslated(second.container, [...ALLOW, 'boom', 'Nope'])).toEqual([]);
  });

  it('while the team loads and while the practice is still being set up', () => {
    teamState.current = makeTeam({ loaded: false, practice: null });
    const a = render(<PracticeSettingsModal open onClose={() => {}} profile={profile()} />);
    expect(findUntranslated(a.container, ALLOW)).toEqual([]);
    a.unmount();
    teamState.current = makeTeam({ practice: null, role: null, members: [] });
    const b = render(<PracticeSettingsModal open onClose={() => {}} profile={profile()} />);
    expect(findUntranslated(b.container, ALLOW)).toEqual([]);
  });

  it('shows the role as a label, not the stored key', () => {
    expect(roleLabel({ role: 'owner', isPrimaryOwner: true })).toBe('⟦Primary owner⟧');
    expect(roleLabel({ role: 'owner', isPrimaryOwner: false })).toBe('⟦Owner⟧');
    expect(roleLabel({ role: 'member', isPrimaryOwner: false })).toBe('⟦Member⟧');
  });

  it('translates the confirmations, notes and errors it raises', async () => {
    const team = makeTeam();
    teamState.current = team;
    const { container } = render(<PracticeSettingsModal open onClose={() => {}} profile={profile()} />);
    fireEvent.click((await screen.findAllByRole('button', { name: '⟦Transfer ownership⟧' }))[0]);
    await waitFor(() => expect(dialogs.confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: '⟦Make joined@vet.com the primary owner?⟧', confirmLabel: '⟦Transfer ownership⟧' })));
    await screen.findByText('⟦Ownership transferred.⟧');

    fireEvent.change(screen.getByLabelText("⟦Colleague's email⟧"), { target: { value: 'not-an-email' } });
    fireEvent.submit(screen.getByLabelText("⟦Colleague's email⟧").closest('form')!);
    await screen.findByText('⟦Enter a valid email address.⟧');
    fireEvent.change(screen.getByLabelText("⟦Colleague's email⟧"), { target: { value: 'a@b.co' } });
    fireEvent.submit(screen.getByLabelText("⟦Colleague's email⟧").closest('form')!);
    await screen.findByText('⟦Invite emailed to a@b.co — they set a password and they\'re in.⟧');
    expect(findUntranslated(container, ALLOW)).toEqual([]);
  });

  it('a billing error that lands after a language switch is in the new language', async () => {
    let fail!: (e: Error) => void;
    billingMock.fetchBilling.mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
    render(<PracticeSettingsModal open onClose={() => {}} profile={profile()} />);
    await loadLanguage('fr');
    await i18n.changeLanguage('fr');
    fail(new Error(''));
    await screen.findByText('Impossible de charger la facturation.');
  });

  it('formats the renewal date in French', async () => {
    await loadLanguage('fr');
    await i18n.changeLanguage('fr');
    billingMock.info = billing({ status: 'active', hasStripe: true, periodEnd: '2026-12-01T12:00:00Z' });
    render(<PracticeSettingsModal open onClose={() => {}} profile={profile()} />);
    await screen.findByText(/renouvellement le 01\/12\/2026/);
  });
});

describe('ChartSettingsModal', () => {
  const props = { onClose: () => {}, prefs: { ...DEFAULT_CHART_PREFS }, followsAccount: true, onChange: vi.fn() };
  it('every group, saved to the account', () => {
    render(<ChartSettingsModal {...props} />);
    expect(findUntranslated(document.body, DRUGS)).toEqual([]);
  });
  it('saved in this browser, with a hidden-columns state', () => {
    render(<ChartSettingsModal {...props} followsAccount={false} prefs={{ ...DEFAULT_CHART_PREFS, mirrorToDiagnosis: true, hiddenColumns: ['mobility'], usualDrug: { name: 'Bupivacaine', concentration: '0.5' } }} />);
    expect(findUntranslated(document.body, [...DRUGS, '0.5', '%'])).toEqual([]);
  });
  it.each(['patient', 'anesthesia', 'charting', 'diagnosis', 'images'] as const)('only the %s page', (section) => {
    render(<ChartSettingsModal {...props} section={section} />);
    expect(screen.getByRole('button', { name: '⟦All chart settings⟧' })).toBeInTheDocument();
    expect(findUntranslated(document.body, DRUGS)).toEqual([]);
  });
});

describe('BillingGate', () => {
  const gate = () => render(<BillingGate><div data-testid="app" /></BillingGate>);
  const ALLOWED_GATE: (string | RegExp)[] = [...ALLOW, 'Sign out'];

  it('owner of a frozen account chooses a plan', async () => {
    billingMock.info = billing({ status: 'canceled', frozenAt: '2026-11-01T00:00:00Z', hasStripe: true });
    const { container } = gate();
    await screen.findByRole('heading', { name: '⟦Choose your plan⟧' });
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    expect(screen.getAllByText(/^⟦\$\d+⟧/).length).toBeGreaterThan(0);
  });

  it('a never-subscribed owner is offered the trial', async () => {
    window.history.replaceState({}, '', '/?x=1');
    // PAID_SIGNUP is off, so a never-subscribed account passes straight through:
    billingMock.info = billing({ status: 'none' });
    gate();
    await screen.findByTestId('app');
  });

  it('a member of a frozen practice, for each reason', async () => {
    for (const status of ['past_due', 'none', 'canceled']) {
      billingMock.info = billing({ role: 'member', status, frozenAt: status === 'none' ? null : '2026-11-01T00:00:00Z' });
      if (status === 'none') continue; // passes through while paid signup is off
      const { container, unmount } = gate();
      await screen.findByRole('heading', { name: /needs a subscription/ });
      expect(findUntranslated(container, ALLOW)).toEqual([]);
      unmount();
    }
  });

  it('a failed payment, with the portal error', async () => {
    billingMock.info = billing({ status: 'past_due', hasStripe: true, frozenAt: '2026-11-01T00:00:00Z' });
    billingMock.openBillingPortal.mockRejectedValue(new Error('Stripe is down'));
    const { container } = gate();
    fireEvent.click(await screen.findByRole('button', { name: '⟦Update payment method⟧' }));
    await screen.findByText('Stripe is down');
    expect(findUntranslated(container, [...ALLOW, 'Stripe is down'])).toEqual([]);
  });

  it('a failed load, and finalizing a checkout', async () => {
    billingMock.fetchBilling.mockRejectedValue(new Error('Offline'));
    const a = gate();
    await screen.findByText('Offline');
    expect(findUntranslated(a.container, [...ALLOW, 'Offline'])).toEqual([]);
    a.unmount();
    window.history.replaceState({}, '', '/?billing=success');
    billingMock.fetchBilling.mockImplementation(async () => billing({ status: 'none' }));
    const b = gate();
    expect(findUntranslated(b.container, ALLOWED_GATE)).toEqual([]);
  });

  it('prices follow the language, in dollars', async () => {
    await loadLanguage('fr');
    await i18n.changeLanguage('fr');
    expect(formatPlanPrice(20)).toMatch(/^20\s\$/);
    billingMock.info = billing({ status: 'canceled', frozenAt: '2026-11-01T00:00:00Z', hasStripe: true });
    gate();
    await screen.findByRole('heading', { name: 'Choisissez votre formule' });
    expect(screen.getAllByText(/^20\s\$/).length).toBeGreaterThan(0);
  });
});

describe('FinishSetupModal', () => {
  const need = { practice: true, doctor: true, suggestedDoctor: 'Dr. Ann Lee', userId: 'u1' };
  it('asks for both names and an optional logo', () => {
    const { container } = render(<FinishSetupModal need={need} profile={profile({ practiceName: '', doctorName: '' })} onDone={() => {}} />);
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(findUntranslated(container, ALLOW)).toEqual([]);
  });
  it('asks for just the practice, or just the doctor, and shows the validation error', async () => {
    const a = render(<FinishSetupModal need={{ ...need, doctor: false }} profile={profile({ practiceName: '' })} onDone={() => {}} />);
    expect(findUntranslated(a.container, ALLOW)).toEqual([]);
    a.unmount();
    const b = render(<FinishSetupModal need={{ ...need, practice: false, suggestedDoctor: '' }} profile={profile({ doctorName: '' })} onDone={() => {}} />);
    fireEvent.submit(b.container.querySelector('form')!);
    await screen.findByText('⟦Both names are needed — they appear on your charts.⟧');
    expect(findUntranslated(b.container, ALLOW)).toEqual([]);
  });
});

describe('JoinPracticeModal', () => {
  it('previews an invitation, and handles already-a-member and errors', async () => {
    invoke.mockResolvedValue({ data: { practiceName: 'Elm Vet', alreadyMember: false }, error: null });
    const a = render(<JoinPracticeModal token="t" onDone={() => {}} />);
    expect(findUntranslated(a.container, ALLOW)).toEqual([]);
    await screen.findByText('⟦Also share the charts I’ve already made⟧');
    expect(findUntranslated(a.container, ALLOW)).toEqual([]);
    a.unmount();

    invoke.mockResolvedValue({ data: { practiceName: 'Elm Vet', alreadyMember: true }, error: null });
    const b = render(<JoinPracticeModal token="t" onDone={() => {}} />);
    await screen.findByText('⟦You’re already a member of ', { exact: false });
    expect(findUntranslated(b.container, ALLOW)).toEqual([]);
    b.unmount();

    invoke.mockResolvedValue({ data: { practiceName: '', alreadyMember: false }, error: null });
    const d = render(<JoinPracticeModal token="t" onDone={() => {}} />);
    await screen.findByText(/^⟦Join ⟦this practice⟧\?⟧$/);
    expect(findUntranslated(d.container, ALLOW)).toEqual([]);
    d.unmount();

    invoke.mockResolvedValue({ data: { error: 'Expired link' }, error: null });
    const c = render(<JoinPracticeModal token="t" onDone={() => {}} />);
    await screen.findByText('Expired link');
    expect(findUntranslated(c.container, [...ALLOW, 'Expired link'])).toEqual([]);
  });
});

describe('FeedbackModal', () => {
  it('each kind, with a transcript to attach', () => {
    const { container } = render(<FeedbackModal onClose={() => {}} transcript="104 GI 2" />);
    for (const name of ['⟦Idea⟧', '⟦Other⟧', '⟦Something’s wrong⟧']) {
      fireEvent.click(screen.getByRole('radio', { name }));
      expect(findUntranslated(document.body, ALLOW)).toEqual([]);
    }
    expect(container).toBeTruthy();
  });
  it('a send failure and success', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Mail is down' } });
    render(<FeedbackModal onClose={() => {}} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: '⟦Send⟧' }));
    await screen.findByText('Mail is down');
    expect(findUntranslated(document.body, [...ALLOW, 'hello', 'Mail is down'])).toEqual([]);
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    fireEvent.click(screen.getByRole('button', { name: '⟦Send⟧' }));
    await waitFor(() => expect(dialogs.toast).toHaveBeenCalledWith('⟦Thanks! Your feedback was sent.⟧', { kind: 'success' }));
  });
});

describe('WalkthroughModal', () => {
  it('every step, with and without the dictation step', () => {
    for (const aiEnabled of [true, false]) {
      const onClose = vi.fn();
      const { unmount } = render(<WalkthroughModal open onClose={onClose} aiEnabled={aiEnabled} onNavigate={() => {}} />);
      const next = () => screen.getByRole('button', { name: /^⟦(Next|Get charting)⟧$/ });
      for (let n = 0; n < 14; n++) {
        expect(findUntranslated(document.body, [])).toEqual([]);
        if (screen.queryByRole('button', { name: '⟦Get charting⟧' })) break;
        if (n === 1) expect(screen.getByRole('button', { name: '⟦Back⟧' })).toBeInTheDocument();
        fireEvent.click(next());
      }
      fireEvent.click(screen.getByRole('button', { name: '⟦Get charting⟧' }));
      expect(onClose).toHaveBeenCalled();
      unmount();
    }
  });
  it('shows progress in French', async () => {
    await loadLanguage('fr');
    await i18n.changeLanguage('fr');
    render(<WalkthroughModal open onClose={() => {}} />);
    expect(screen.getByText('1 sur 11')).toBeInTheDocument();
  });
});

describe('PDF chrome', () => {
  it('the style picker, wide and compact', () => {
    const a = render(<PdfStylePicker styleId="custom:journal:#123456" onChange={() => {}} compact={false} />);
    expect(findUntranslated(a.container, [])).toEqual([]);
    a.unmount();
    const b = render(<PdfStylePicker styleId="iris" onChange={() => {}} compact />);
    fireEvent.click(screen.getByRole('button', { name: /Iris/ }));
    expect(findUntranslated(document.body, [])).toEqual([]);
    b.unmount();
    const c = render(<PdfStylePicker styleId="custom:slate:#123456" onChange={() => {}} compact />);
    expect(findUntranslated(c.container, [])).toEqual([]);
  });

  const svg = () => document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const snapshot = { patientInfo: { patientName: 'Bella', patientNumber: '7', date: '2026-11-12' }, toothData: [], species: 'canine', logo: 'a', preSvg: svg(), preComments: [], preState: {}, postSvg: svg(), postComments: [], postState: {} } as unknown as ChartSnapshot;

  it('the preview modal while it builds, and when it is ready', async () => {
    const { container } = render(<PdfPreviewModal open onClose={() => {}} snapshot={snapshot} />);
    expect(findUntranslated(container, ['Bella'])).toEqual([]);
    await waitFor(() => expect(container.querySelector('iframe')).not.toBeNull());
    expect(findUntranslated(container, ['Bella'])).toEqual([]);
  });

  it('the preview modal with image warnings and a failed build', async () => {
    const { listChartAttachments } = await import('../hooks/useAttachments');
    vi.mocked(listChartAttachments).mockResolvedValue(null);
    const { container } = render(<PdfPreviewModal open onClose={() => {}} snapshot={{ ...snapshot, imagesChartId: 'c1' }} />);
    await screen.findByText('⟦Couldn\'t load the chart\'s images, so they\'re not in this PDF. Close and reopen the preview to retry.⟧');
    expect(findUntranslated(container, [])).toEqual([]);
  });

  it('the link panel', () => {
    const a = render(<PdfLinkPanel state="preparing" />);
    expect(findUntranslated(a.container, [])).toEqual([]);
    a.unmount();
    const b = render(<PdfLinkPanel state={{ url: 'https://x/d.pdf', filename: 'bella.pdf' }} />);
    expect(findUntranslated(b.container, [])).toEqual([]);
  });

  it('the page-image preview error', async () => {
    // pdf.js has no worker in jsdom, so drawing fails: that is the state under test.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<PdfPagesPreview blob={new Blob(['x'])} title="⟦Clinical chart preview⟧" />);
    await screen.findByText('⟦Couldn’t draw the preview — Download still works.⟧');
    expect(findUntranslated(container, [])).toEqual([]);
    quiet.mockRestore();
  });

  it('browser hints are translated', () => {
    expect(downloadHint('Mozilla/5.0 (Android 14; Mobile; rv:160.0) Firefox/160.0')).toBe('⟦Firefox opens the PDF in a new tab — tap Download at the top of it to save the file.⟧');
    expect(inAppBrowserMessage()).toMatch(/^⟦/);
  });
});

describe('AccountModal', () => {
  it('every section, the language picker and the password hints', async () => {
    const { container } = render(<AccountModal open onClose={() => {}} profile={profile()} language="en" onLanguageChange={() => {}} />);
    await waitFor(() => expect(screen.getAllByDisplayValue('me@vet.com').length).toBeGreaterThan(0));
    // Languages are named in themselves (endonyms), never translated.
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(Object.values(LANGUAGE_NAMES));
    expect(findUntranslated(container, [...ALLOW, ...Object.values(LANGUAGE_NAMES)])).toEqual([]);
    const [pw, confirm] = container.querySelectorAll<HTMLInputElement>('input[autocomplete="new-password"]');
    fireEvent.change(pw, { target: { value: 'short' } });
    fireEvent.change(confirm, { target: { value: 'shorter' } });
    expect(findUntranslated(container, [...ALLOW, ...Object.values(LANGUAGE_NAMES)])).toEqual([]);
  });
});
