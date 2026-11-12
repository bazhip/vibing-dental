import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { WhatsNewModal } from './WhatsNewModal';
import { WHATS_NEW, shouldShowWhatsNew } from '../constants/whatsNew';

describe("What's new", () => {
  it('lists every group and item, and closes', () => {
    const onClose = vi.fn();
    render(<WhatsNewModal onClose={onClose} />);
    expect(screen.getByRole('heading', { name: WHATS_NEW.title })).toBeInTheDocument();
    for (const g of WHATS_NEW.groups) {
      expect(screen.getByRole('heading', { name: g.heading })).toBeInTheDocument();
      for (const it of g.items) expect(screen.getByText(`${it.title}.`)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows once per account, after settings load, never over the first-run walkthrough', () => {
    const base = { signedIn: true, settingsLoaded: true, seenId: '', onboardedDevice: true, walkthroughOpen: false };
    expect(shouldShowWhatsNew(base)).toBe(true);
    expect(shouldShowWhatsNew({ ...base, seenId: WHATS_NEW.id })).toBe(false); // already seen
    expect(shouldShowWhatsNew({ ...base, settingsLoaded: false })).toBe(false); // wait for the account
    expect(shouldShowWhatsNew({ ...base, onboardedDevice: false })).toBe(false); // first run: walkthrough instead
    expect(shouldShowWhatsNew({ ...base, walkthroughOpen: true })).toBe(false);
    expect(shouldShowWhatsNew({ ...base, signedIn: false })).toBe(false); // trial
    expect(shouldShowWhatsNew({ ...base, seenId: 'older-release' })).toBe(true); // a newer announcement
  });
});
