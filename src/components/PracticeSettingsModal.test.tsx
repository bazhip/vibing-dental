import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
vi.mock('../hooks/useTeam', () => ({ useTeam: () => teamState.current }));
vi.mock('../hooks/useBilling', () => billingMock);
vi.mock('./OwnerReportTemplatesModal', () => ({ OwnerReportTemplatesModal: () => null }));
const native = vi.hoisted(() => ({ value: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => native.value, WEB_ORIGIN: 'https://toothops.app/' }));

import { PracticeSettingsModal } from './PracticeSettingsModal';
import { DialogHost } from './ui/dialogs';
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
