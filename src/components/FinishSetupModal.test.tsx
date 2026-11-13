import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const flags = vi.hoisted(() => ({ native: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => flags.native, WEB_ORIGIN: 'https://toothops.app/' }));
vi.mock('../utils/supabaseClient', () => ({ supabase: null, cloudEnabled: false }));
const writeString = vi.hoisted(() => vi.fn());
vi.mock('../utils/storage', async (orig) => ({
  ...(await orig<typeof import('../utils/storage')>()),
  writeString: (...a: unknown[]) => writeString(...a),
}));

import { FinishSetupModal, type SetupNeed } from './FinishSetupModal';
import type { UseProfileReturn } from '../hooks/useProfile';

const need: SetupNeed = { practice: true, doctor: true, suggestedDoctor: 'Dr. Jane', userId: 'u1' };
const makeProfile = () =>
  ({
    practiceName: '', doctorName: '', logoUrl: '', practiceId: '', loaded: true,
    update: vi.fn(async () => undefined), uploadLogo: vi.fn(async () => undefined),
  }) as unknown as UseProfileReturn;

beforeEach(() => {
  flags.native = false;
  writeString.mockClear();
});

describe('FinishSetupModal — website (unchanged)', () => {
  it('is the centred modal with Later / Save under the form', () => {
    render(<FinishSetupModal need={need} profile={makeProfile()} onDone={vi.fn()} />);
    expect(document.querySelector('.ai-settings-overlay .ai-settings-modal')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Finish setting up' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Doctor name/)).toHaveValue('Dr. Jane');
    expect(screen.getByRole('button', { name: 'Later' })).toHaveClass('diagram-view__action');
    expect(document.querySelector('.ios-sheet')).toBeNull();
  });
});

describe('FinishSetupModal — iOS app', () => {
  beforeEach(() => { flags.native = true; });

  it('is a sheet: Later leading, Save trailing, grouped name fields', async () => {
    const profile = makeProfile();
    const onDone = vi.fn();
    render(<FinishSetupModal need={need} profile={profile} onDone={onDone} />);
    const sheet = screen.getByRole('dialog', { name: 'Finish setting up' });
    expect(sheet).toHaveClass('ios-sheet');
    expect(document.querySelector('.ios-sheet__grabber')).not.toBeNull();
    expect(sheet.querySelector('.ios-form-group')).not.toBeNull();
    fireEvent.change(screen.getByLabelText(/^Practice name/), { target: { value: 'SoCal Vet' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(profile.update).toHaveBeenCalledWith({ practiceName: 'SoCal Vet', doctorName: 'Dr. Jane' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('Later hides it on this device', async () => {
    const onDone = vi.fn();
    render(<FinishSetupModal need={need} profile={makeProfile()} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(writeString).toHaveBeenCalledWith('setup.dismissed.u1', 1, '1');
  });
});
