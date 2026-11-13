import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { API_ERRORS, apiError, type ApiErrorCode } from '../../supabase/functions/_shared/apiErrors';
import { ApiError, LocalizedError, apiErrorFromBody, apiErrorMessage, errorText } from './apiErrors';
import { friendlyError } from '../components/ui/dialogs';
import frCommon from '../locales/fr/common.json';

// Sample params per parameterised code; several values exercise the plurals.
const SAMPLES: Partial<Record<ApiErrorCode, Record<string, string | number>[]>> = {
  invite_failed: [{ detail: 'User already registered' }],
  owner_has_members: [{ name: 'Elm Vet', count: 1 }, { name: 'Elm Vet', count: 3 }],
  owner_has_members_unnamed: [{ count: 1 }, { count: 2 }],
  team_too_large: [{ members: 3, count: 1, plan: 'ToothOps Individual' }, { members: 7, count: 5, plan: 'ToothOps Practice' }],
  email_failed: [{ detail: '{"message":"bad"}' }],
  ai_failed: [{ detail: 'overloaded' }],
  voice_token_failed: [{ detail: 'nope' }],
};
const CODES = Object.keys(API_ERRORS) as ApiErrorCode[];
const bodiesFor = (code: ApiErrorCode) =>
  (SAMPLES[code] ?? [undefined]).map((p) => (apiError as (c: ApiErrorCode, p?: object) => ReturnType<typeof apiError>)(code, p));

afterEach(async () => { await i18n.changeLanguage('en'); });

describe('apiErrorMessage', () => {
  it('shows exactly the server’s English text for every code in en', async () => {
    await i18n.changeLanguage('en');
    for (const code of CODES) {
      for (const body of bodiesFor(code)) {
        expect(apiErrorMessage(body, 'common:errors.generic'), code).toBe(body.error);
      }
    }
  });

  it('maps each code to its French translation', async () => {
    await i18n.changeLanguage('fr');
    const api = frCommon.errors.api as Record<string, string>;
    for (const code of CODES) {
      for (const body of bodiesFor(code)) {
        const msg = apiErrorMessage(body, 'common:errors.generic');
        expect(msg, code).not.toBe(body.error);
        const template = api[code] ?? api[`${code}_one`];
        expect(template, code).toBeTruthy();
        // The fixed part of the French sentence is there.
        expect(msg, code).toContain(template.split('{{')[0].slice(0, 12));
      }
    }
    expect(apiErrorMessage(apiError('daily_reminder_limit'), 'common:errors.generic'))
      .toBe('Limite quotidienne de rappels atteinte (100). Réessayez demain.');
    expect(apiErrorMessage(apiError('invite_failed', { detail: 'boom' }), 'common:errors.generic'))
      .toBe('Impossible d’envoyer l’invitation : boom');
  });

  it('wraps an unknown code’s raw text in the German wrapper', async () => {
    await i18n.changeLanguage('de');
    expect(apiErrorMessage({ error: 'weird backend text', code: 'brand_new_code' }, 'common:errors.generic'))
      .toBe('Etwas ist schiefgelaufen (Details: weird backend text)');
  });

  it('shows raw text bare in English and falls back to the key when there is nothing', async () => {
    expect(apiErrorMessage({ error: 'weird backend text' }, 'common:errors.generic')).toBe('weird backend text');
    expect(apiErrorMessage({}, 'common:errors.generic')).toBe('Something went wrong. Please try again.');
    expect(apiErrorMessage(null, 'common:errors.network')).toBe(i18n.t('errors.network'));
    await i18n.changeLanguage('fr');
    expect(apiErrorMessage(undefined, 'common:errors.generic')).toBe('Une erreur s’est produite. Veuillez réessayer.');
  });
});

describe('apiErrorFromBody', () => {
  it('a coded body becomes a translated ApiError that keeps the English', async () => {
    await i18n.changeLanguage('fr');
    const err = apiErrorFromBody(apiError('already_member'), 400);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('Cette personne est déjà membre de ce cabinet.');
    expect((err as ApiError).serverMessage).toBe('They’re already a member of this practice.');
    expect((err as ApiError).status).toBe(400);
  });

  it('a codeless body stays a plain Error with the raw text', () => {
    const err = apiErrorFromBody({ error: 'duplicate key' });
    expect(err).not.toBeInstanceOf(LocalizedError);
    expect(err.message).toBe('duplicate key');
  });
});

describe('friendlyError', () => {
  it('wraps raw text in the French wrapper', async () => {
    await i18n.changeLanguage('fr');
    expect(friendlyError(new Error('weird backend text'))).toBe('Une erreur s’est produite (détails : weird backend text)');
    // Already-translated and coded errors are shown as they are.
    expect(friendlyError(new LocalizedError('Déjà traduit.'))).toBe('Déjà traduit.');
    expect(friendlyError(apiErrorFromBody(apiError('not_owner')))).toBe('Seul un responsable du cabinet peut ajouter des membres.');
    // Coded errors still hit the English patterns they always did.
    expect(friendlyError(apiErrorFromBody(apiError('dictation_rate_limit')))).toBe(i18n.t('errors.rateLimit'));
  });

  it('keeps its existing English outputs', () => {
    expect(friendlyError(new Error('weird backend text'))).toBe('weird backend text');
    expect(friendlyError('plain string')).toBe('plain string');
    expect(friendlyError(null)).toBe('Something went wrong. Please try again.');
    expect(friendlyError(undefined, 'Custom fallback')).toBe('Custom fallback');
    expect(friendlyError(new Error('TypeError: Failed to fetch'))).toBe('Can’t reach ToothOps — check your connection and try again.');
    expect(friendlyError(new Error('JSON object requested, multiple (or no) rows returned'))).toBe('That chart couldn’t be found — it may have been deleted.');
    expect(friendlyError(new Error('new row violates row-level security policy'))).toBe('You don’t have access to that.');
    expect(friendlyError(new Error('Email rate limit exceeded'))).toBe('Too many attempts. Wait a minute and try again.');
    expect(friendlyError(apiErrorFromBody(apiError('already_member')))).toBe('They’re already a member of this practice.');
  });
});

describe('errorText', () => {
  it('translated errors as-is, raw ones wrapped outside English', async () => {
    expect(errorText(new Error('raw'), 'fb')).toBe('raw');
    expect(errorText('nope', 'fb')).toBe('fb');
    await i18n.changeLanguage('es');
    expect(errorText(new Error('raw'), 'fb')).toBe('Algo salió mal (detalles: raw)');
    expect(errorText(new LocalizedError('Ya traducido.'), 'fb')).toBe('Ya traducido.');
  });
});
