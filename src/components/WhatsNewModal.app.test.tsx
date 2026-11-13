import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// "What's new" in the iOS app: the auto-open (signed-in accounts, once per
// release) is an iOS sheet with Done trailing — never the website modal.
const native = vi.hoisted(() => ({ on: true }));
vi.mock('../native/platform', () => ({ isNativeApp: () => native.on }));

import { WhatsNewModal } from './WhatsNewModal';
import { WHATS_NEW } from '../constants/whatsNew';

afterEach(() => { native.on = true; });

describe("What's new in the iOS app", () => {
  it('is a sheet titled What’s new, with Done trailing and the same body as the Settings screen', () => {
    render(<WhatsNewModal onClose={() => {}} />);
    const sheet = screen.getByRole('dialog', { name: WHATS_NEW.title });
    expect(sheet).toHaveClass('ios-sheet');
    expect(document.querySelector('.ai-settings-overlay')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(sheet.querySelector('.whats-new__body')).not.toBeNull();
    for (const g of WHATS_NEW.groups) expect(screen.getByRole('heading', { name: g.heading })).toBeInTheDocument();
    // Touch wording, as on the Settings screen.
    expect(sheet.textContent).toContain('Tap tooth numbers in the grid');
  });

  it('Done closes (and so marks it seen)', () => {
    const onClose = vi.fn();
    render(<WhatsNewModal onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('swiping it away (Escape here) closes too', async () => {
    const onClose = vi.fn();
    render(<WhatsNewModal onClose={onClose} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('the Settings screen presentation stays the body only', () => {
    render(<WhatsNewModal onClose={() => {}} presentation="screen" />);
    expect(document.querySelector('.ios-sheet')).toBeNull();
  });

  it('the website keeps its modal', () => {
    native.on = false;
    render(<WhatsNewModal onClose={() => {}} />);
    expect(document.querySelector('.ai-settings-overlay')).not.toBeNull();
    expect(document.querySelector('.ios-sheet')).toBeNull();
  });
});
