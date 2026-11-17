import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import type { UseTeamReturn, TeamMember } from '../hooks/useTeam';
import type { BillingInfo } from '../hooks/useBilling';

const teamState = vi.hoisted(() => ({ current: null as unknown as UseTeamReturn }));
const billingMock = vi.hoisted(() => ({
  fetchBilling: vi.fn(),
  openBillingPortal: vi.fn(),
  changePlan: vi.fn(),
}));

vi.mock('../utils/supabaseClient', () => ({ supabase: { auth: {} }, cloudEnabled: true }));
const treatmentStore = vi.hoisted(() => ({ enabled: true, loaded: true, templates: [] as { id: string; name: string; body: string }[], create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock('../hooks/useReportTemplates', () => ({ useReportTemplates: () => treatmentStore }));
vi.mock('../hooks/useTeam', () => ({ useTeam: () => teamState.current }));
vi.mock('../hooks/useBilling', () => billingMock);
const native = vi.hoisted(() => ({ value: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => native.value, WEB_ORIGIN: 'https://toothops.app/' }));

import { PracticeSettingsModal } from './PracticeSettingsModal';
import { DialogHost } from './ui/dialogs';
import { defaultConfig } from '../utils/ownerReportConfig';
import type { UseProfileReturn } from '../hooks/useProfile';

const member = (over: Partial<TeamMember>): TeamMember => ({
  userId: 'u',
  email: 'x@vet.com',
  doctorName: '',
  role: 'member',
  isYou: false,
  pending: false,
  isPrimaryOwner: false,
  ...over,
});

const makeTeam = (over: Partial<UseTeamReturn> = {}): UseTeamReturn => ({
  enabled: true,
  loaded: true,
  error: '',
  practice: { id: 'p1', name: 'SoCal Vet' },
  role: 'owner',
  primaryOwnerId: 'me',
  members: [
    member({ userId: 'me', email: 'me@vet.com', role: 'owner', isYou: true, isPrimaryOwner: true }),
    member({ userId: 'm1', email: 'joined@vet.com' }),
    member({ userId: 'm2', email: 'pending@vet.com', pending: true }),
  ],
  refresh: vi.fn().mockResolvedValue(undefined),
  createPractice: vi.fn(),
  addMember: vi.fn().mockResolvedValue('invited'),
  resendInvite: vi.fn(),
  removeMember: vi.fn().mockResolvedValue(undefined),
  setRole: vi.fn(),
  transferOwnership: vi.fn(),
  ...over,
});

const billing = (over: Partial<BillingInfo> = {}): BillingInfo => ({
  practice: { id: 'p1', name: 'SoCal Vet' },
  role: 'owner',
  plan: 'basic',
  accountType: 'individual',
  status: 'none',
  periodEnd: null,
  frozenAt: null,
  seats: 1,
  memberCount: 3,
  hasStripe: false,
  ownerEmail: 'me@vet.com',
  intendedPlan: 'individual_basic',
  ...over,
});

const profile = {
  practiceName: 'SoCal Vet',
  doctorName: 'Dr. Ng',
  logoUrl: '',
  ownerReportEnabled: false,
  update: vi.fn().mockResolvedValue(undefined),
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
} as unknown as UseProfileReturn;

const renderModal = (onClose = vi.fn()) => {
  render(
    <>
      <PracticeSettingsModal open onClose={onClose} profile={profile} />
      <DialogHost />
    </>
  );
  return onClose;
};

beforeEach(() => {
  native.value = false;
  billingMock.fetchBilling.mockClear();
  teamState.current = makeTeam();
  billingMock.fetchBilling.mockResolvedValue(billing());
  (profile.update as ReturnType<typeof vi.fn>).mockClear();
});

describe('PracticeSettingsModal', () => {
  it.each(['page', 'modal'] as const)('keeps PIMS review in General with %s section navigation', async (presentation) => {
    vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true');
    try {
      render(<PracticeSettingsModal open presentation={presentation} sectionNavigation onClose={vi.fn()} profile={profile} />);
      expect(screen.getByRole('heading', { name: 'PIMS appointments' })).toBeVisible();
      await userEvent.click(screen.getByRole('button', { name: 'Team' }));
      expect(screen.queryByRole('heading', { name: 'PIMS appointments' })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'General' }));
      expect(screen.getByRole('heading', { name: 'PIMS appointments' })).toBeVisible();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('in the app: no billing section, and billing is never fetched', async () => {
    native.value = true;
    billingMock.fetchBilling.mockResolvedValue(billing({ status: 'active', hasStripe: true }));
    renderModal();
    expect(screen.getByLabelText('Practice name')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Billing' })).toBeNull();
    expect(screen.queryByText(/Manage billing|Free beta|Loading billing|\$\d/)).toBeNull();
    expect(billingMock.fetchBilling).not.toHaveBeenCalled();
  });

  it('shows a team load error with Retry, and locks the practice name', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    teamState.current = makeTeam({ error: 'Can’t reach ToothOps.', practice: null, role: null, members: [], refresh });
    renderModal();

    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn’t load your team/);
    expect(screen.queryByText(/being set up/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Practice name')).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('shows the free beta instead of prices when there is no live subscription', async () => {
    renderModal();
    expect(await screen.findByText(/Free beta/)).toBeInTheDocument();
    expect(screen.getByText(/5 seats · 10 images per chart · AI dictation included/)).toBeInTheDocument();
    expect(screen.queryByText(/not subscribed yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$\d+\/mo/)).not.toBeInTheDocument();
    expect(screen.queryByText(/pick a plan/)).not.toBeInTheDocument();
  });

  it('humanizes roles and offers no role changes on pending invites', () => {
    renderModal();
    expect(screen.getByText('Primary owner')).toBeInTheDocument();
    expect(screen.getAllByText('Member')).toHaveLength(2);
    // Only the joined member can be made an owner.
    expect(screen.getAllByRole('button', { name: 'Make owner' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Transfer ownership' })).toHaveLength(1);
  });

  it('submits the add-colleague field on Enter', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText("Colleague's email"), 'new@vet.com{Enter}');
    await waitFor(() => expect(teamState.current.addMember).toHaveBeenCalledWith('new@vet.com'));
    expect(await screen.findByText(/Invite emailed to new@vet.com/)).toBeInTheDocument();
  });

  it('confirms before removing a member', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Remove joined@vet.com from the practice?');
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(teamState.current.removeMember).not.toHaveBeenCalled();
  });

  it('shows Done when clean, Cancel/Save once the name is edited', async () => {
    const user = userEvent.setup();
    const onClose = renderModal();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Practice name'), ' Clinic');
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(profile.update).toHaveBeenCalledWith({ practiceName: 'SoCal Vet Clinic', doctorName: 'Dr. Ng' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('asks before discarding an edited name on Escape', async () => {
    const user = userEvent.setup();
    const onClose = renderModal();
    await user.type(screen.getByLabelText('Practice name'), '!');
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/Discard the practice name change/);
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop only when press and release are both on it', () => {
    const onClose = renderModal();
    const overlay = screen.getByRole('dialog', { name: 'Practice settings' });
    // Press inside (drag-select), release over the backdrop.
    fireEvent.mouseDown(screen.getByLabelText('Practice name'));
    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Practice settings workspace', () => {
  it('separates settings destinations and preserves a name draft between sections', async () => {
    render(<PracticeSettingsModal open presentation="page" onClose={vi.fn()} profile={profile} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Practice settings' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Practice name'), { target: { value: 'New practice' } });
    await userEvent.click(screen.getByRole('button', { name: 'Team' }));
    expect(screen.queryByRole('textbox', { name: 'Practice name' })).toBeNull();
    expect(screen.getByText('joined@vet.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'General' }));
    expect(screen.getByLabelText('Practice name')).toHaveValue('New practice');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('registers an unsaved-change guard for app navigation and removes it on unmount', async () => {
    let guard: (() => Promise<boolean>) | null = null;
    const register = vi.fn((next: (() => Promise<boolean>) | null) => { guard = next; });
    const { unmount } = render(<><PracticeSettingsModal open presentation="page" onClose={vi.fn()} profile={profile} onLeaveGuardChange={register} /><DialogHost /></>);
    expect(await guard!()).toBe(true);
    fireEvent.change(screen.getByLabelText('Practice name'), { target: { value: 'Draft practice' } });
    let leaving: Promise<boolean>;
    await act(async () => { leaving = guard!(); });
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(await leaving!).toBe(false);
    unmount();
    expect(register).toHaveBeenLastCalledWith(null);
  });

  it('opens treatment templates without owner reports and protects their drafts on workspace navigation', async () => {
    let guard: (() => Promise<boolean>) | null = null;
    render(<><PracticeSettingsModal open presentation="page" onClose={vi.fn()} profile={profile}
      onLeaveGuardChange={(next) => { guard = next; }} /><DialogHost /></>);
    await userEvent.click(screen.getByRole('button', { name: 'Templates' }));
    await userEvent.click(screen.getByRole('button', { name: 'Customize treatment report' }));
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Extraction' } });
    let leaving: Promise<boolean>;
    await act(async () => { leaving = guard!(); });
    await userEvent.click(screen.getByRole('button', { name: 'Keep Editing' }));
    expect(await leaving!).toBe(false);
    expect(screen.getByLabelText('Template name')).toHaveValue('Extraction');
    await act(async () => { leaving = guard!(); });
    await userEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));
    expect(await leaving!).toBe(true);
  });

  it('lets members save treatment templates and returns to Templates after closing', async () => {
    teamState.current = makeTeam({ role: 'member' });
    treatmentStore.create.mockResolvedValue({ id: 'saved', name: 'Extraction', body: 'Procedure notes' });
    render(<PracticeSettingsModal open presentation="page" onClose={vi.fn()} profile={profile} />);
    await userEvent.click(screen.getByRole('button', { name: 'Templates' }));
    await userEvent.click(screen.getByRole('button', { name: 'Customize treatment report' }));
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Extraction' } });
    fireEvent.change(screen.getByLabelText('Report text'), { target: { value: 'Procedure notes' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save template' }));
    expect(treatmentStore.create).toHaveBeenCalledWith('Extraction', 'Procedure notes');
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    expect(screen.getByRole('button', { name: 'Templates' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Customize treatment report' })).toBeInTheDocument();
  });

  it('checks template drafts before allowing workspace navigation', async () => {
    let guard: (() => Promise<boolean>) | null = null;
    render(<><PracticeSettingsModal open presentation="page" onClose={vi.fn()}
      profile={{ ...profile, ownerReportEnabled: true, ownerReportConfig: defaultConfig(), saveOwnerReportConfig: vi.fn() }}
      onLeaveGuardChange={(next) => { guard = next; }} /><DialogHost /></>);
    await userEvent.click(screen.getByRole('button', { name: 'Templates' }));
    await userEvent.click(screen.getByRole('button', { name: 'Customize owner report' }));
    await userEvent.type(screen.getByLabelText('Template name'), ' draft');
    let leaving: Promise<boolean>;
    await act(async () => { leaving = guard!(); });
    const prompt = await screen.findByRole('alertdialog');
    expect(prompt).toHaveTextContent('Discard your unsaved changes to the owner report templates?');
    await userEvent.click(screen.getByRole('button', { name: 'Keep Editing' }));
    expect(await leaving!).toBe(false);
    expect(screen.getByLabelText('Template name')).toHaveValue('Standard draft');
    await act(async () => { leaving = guard!(); });
    await userEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));
    expect(await leaving!).toBe(true);
  });

  it('keeps the settings workspace open after saving the practice name', async () => {
    const onClose = vi.fn();
    render(<PracticeSettingsModal open presentation="page" onClose={onClose} profile={profile} />);
    fireEvent.change(screen.getByLabelText('Practice name'), { target: { value: 'Saved practice' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(profile.update).toHaveBeenCalledWith({ practiceName: 'Saved practice', doctorName: profile.doctorName });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('asks before leaving an unsaved workspace and keeps the draft when cancelled', async () => {
    const onClose = vi.fn();
    render(<><PracticeSettingsModal open presentation="page" onClose={onClose} profile={profile} /><DialogHost /></>);
    fireEvent.change(screen.getByLabelText('Practice name'), { target: { value: 'Unsaved name' } });
    await userEvent.click(screen.getByRole('button', { name: 'Back to current visit' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Discard the practice name change?');
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Practice name')).toHaveValue('Unsaved name');
  });
});

it('keeps personal chart preferences outside practice category navigation', async () => {
  const openChart = vi.fn();
  render(<PracticeSettingsModal open presentation="page" onClose={vi.fn()} profile={profile} onOpenChartSettings={openChart} />);
  const button = await screen.findByRole('button', { name: 'Charting preferences' });
  expect(button.closest('nav')).toBeNull();
  expect(screen.getByText(/Personal chart preferences/)).toBeVisible();
  fireEvent.click(button);
  expect(openChart).toHaveBeenCalledOnce();
});

it('fills a name loaded after opening without treating it as a user edit', async () => {
  const onClose = vi.fn();
  const { rerender } = render(<><PracticeSettingsModal open onClose={onClose} profile={{ ...profile, practiceName: '' }} /><DialogHost /></>);
  rerender(<><PracticeSettingsModal open onClose={onClose} profile={{ ...profile, practiceName: 'Loaded Practice' }} /><DialogHost /></>);
  expect(screen.getByDisplayValue('Loaded Practice')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

it('preserves an actual name edit when profile data refreshes', () => {
  const { rerender } = render(<PracticeSettingsModal open onClose={vi.fn()} profile={profile} />);
  fireEvent.change(screen.getByDisplayValue('SoCal Vet'), { target: { value: 'My edit' } });
  rerender(<PracticeSettingsModal open onClose={vi.fn()} profile={{ ...profile, practiceName: 'Refreshed Practice' }} />);
  expect(screen.getByDisplayValue('My edit')).toBeInTheDocument();
});

it('lists treatment titles in settings and opens the selected editor', async () => {
  treatmentStore.templates = [{ id: 'a', name: 'Routine cleaning', body: 'Cleaned' }, { id: 'b', name: 'Extractions', body: 'Extracted' }];
  renderModal();
  expect(screen.getByRole('button', { name: 'Routine cleaning' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Extractions' }));
  expect(await screen.findByDisplayValue('Extracted')).toBeInTheDocument();
  expect(screen.getByLabelText('Template name')).toHaveValue('Extractions');
  treatmentStore.templates = [];
});
