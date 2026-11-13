import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('../utils/supabaseClient', () => ({ supabase: { auth: {} }, cloudEnabled: true }));

import { SessionExpiredOverlay } from './SessionExpiredOverlay';

describe('SessionExpiredOverlay', () => {
  it('offers Apple alongside Google, with the hint, and email sign-in', () => {
    render(<SessionExpiredOverlay email="me@vet.com" onSignOut={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeInTheDocument();
    expect(screen.getByText('Already have an account or were invited? Sign in with your email.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in and continue charting' })).toBeInTheDocument();
  });
});
