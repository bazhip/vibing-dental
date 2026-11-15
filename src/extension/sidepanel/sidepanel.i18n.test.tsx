import { vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

const fake = vi.hoisted(() => {
  const state: { listener: ((event: string, session: unknown) => void) | null } = { listener: null };
  const client = {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        state.listener = cb;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  };
  return { state, client, current: client as unknown };
});
vi.mock('../../utils/supabaseClient', () => ({
  get supabase() { return fake.current; },
  get cloudEnabled() { return fake.current !== null; },
}));
// The panel applies the browser language; keep the pseudo-locale in place.
vi.mock('../../i18n/applyLanguage', () => ({ applyLanguage: async () => 'applied' }));

import { installPseudoLocale, restoreLocale, findUntranslated } from '../../i18n/testing/pseudo';
import { SidePanelApp } from './SidePanelApp';
import { SignIn } from './SignIn';

beforeEach(async () => {
  fake.current = fake.client;
  await installPseudoLocale();
});
afterEach(async () => {
  cleanup();
  await restoreLocale();
});

const emit = (event: string, session: unknown) => act(() => fake.state.listener!(event, session));

describe('side panel (pseudo-locale)', () => {
  it('loading', () => {
    render(<SidePanelApp />);
    expect(findUntranslated(document.body)).toEqual([]);
  });

  it('signed out', async () => {
    render(<SidePanelApp />);
    await emit('INITIAL_SESSION', null);
    expect(document.querySelector('form')).not.toBeNull();
    expect(findUntranslated(document.body)).toEqual([]);
  });

  it('sign-in form on its own', () => {
    render(<SignIn />);
    expect(findUntranslated(document.body)).toEqual([]);
  });

  it('signed in', async () => {
    render(<SidePanelApp />);
    await emit('INITIAL_SESSION', { user: { id: 'u1', email: 'vet@clinic.test' } });
    expect(document.querySelector('.sp-header')).not.toBeNull();
    expect(findUntranslated(document.body, [/vet@clinic\.test/])).toEqual([]);
  });

  it('not connected', () => {
    fake.current = null;
    render(<SidePanelApp />);
    expect(findUntranslated(document.body)).toEqual([]);
  });
});
