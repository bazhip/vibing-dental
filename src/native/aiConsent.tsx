import React from 'react';
import { Trans } from 'react-i18next';
import { isNativeApp } from './platform';
import { readString, writeString } from '../utils/storage';
import { presentSheet } from '../components/ui/dialogs';
import { Sheet, type SheetDetent } from '../ios/Sheet';
import i18n from '../i18n';

/**
 * One-time consent before the app first sends anything to a third-party
 * AI service (App Store Guideline 5.1.2(i)): dictation streams audio to
 * Deepgram, and dictation and AI drafts send chart text to Anthropic.
 * Asked before the first such action; "Allow" is remembered on this
 * device, "Not now" cancels the action and asks again next time (there's
 * no other way to turn the features back on). The website never asks.
 */

const KEY = 'toothops.aiConsent';
const VERSION = 1;
const DETENTS: SheetDetent[] = ['medium', 'large'];

/** True when the next AI action must ask first (app, not yet allowed). */
export function needsAiConsent(): boolean {
  return isNativeApp() && readString(KEY, VERSION, '') !== 'allowed';
}

/** Resolves true when the AI action may go ahead. */
export async function ensureAiConsent(): Promise<boolean> {
  if (!needsAiConsent()) return true;
  const t = i18n.getFixedT(null, 'chart', 'aiConsent');
  // A sheet (HIG: a consent explanation, not a short alert): Not now on the
  // leading edge, Allow on the trailing edge; swiping it away is Not now.
  const ok = await presentSheet<boolean>(
    ({ open, finish }) => (
      <Sheet
        open={open}
        onClose={() => finish(false)}
        title={t('title')}
        cancelLabel={t('notNow')}
        doneLabel={t('allow')}
        onDone={() => finish(true)}
        detents={DETENTS}
        className="ai-consent-sheet"
      >
        <div className="ios-form ai-consent">
          <p className="ios-form-text">{t('intro')}</p>
          <ul className="ai-consent__list">
            <li>
              <Trans t={t} i18nKey="deepgram" components={{ strong: <strong /> }} />
            </li>
            <li>
              <Trans t={t} i18nKey="anthropic" components={{ strong: <strong /> }} />
            </li>
          </ul>
          <p className="ios-form-footer">{t('nothingSent')}</p>
        </div>
      </Sheet>
    ),
    false
  );
  if (ok) writeString(KEY, VERSION, 'allowed');
  return ok;
}
