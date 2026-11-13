import React from 'react';
import { isNativeApp } from './platform';
import { readString, writeString } from '../utils/storage';
import { confirmDialog } from '../components/ui/dialogs';

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

/** True when the next AI action must ask first (app, not yet allowed). */
export function needsAiConsent(): boolean {
  return isNativeApp() && readString(KEY, VERSION, '') !== 'allowed';
}

/** Resolves true when the AI action may go ahead. */
export async function ensureAiConsent(): Promise<boolean> {
  if (!needsAiConsent()) return true;
  const ok = await confirmDialog({
    title: 'Use AI services?',
    message: (
      <>
        <p>To dictate into a chart and to write AI drafts, ToothOps sends data to two services:</p>
        <ul>
          <li>
            <strong>Deepgram</strong> receives the audio of your voice while you dictate, to turn it into text.
          </li>
          <li>
            <strong>Anthropic</strong> (Claude) receives the dictation transcript and the chart's contents, such as
            patient details and findings, to fill in the chart or draft the owner report.
          </li>
        </ul>
        <p>Nothing is sent unless you use these features.</p>
      </>
    ),
    confirmLabel: 'Allow',
    cancelLabel: 'Not now',
  });
  if (ok) writeString(KEY, VERSION, 'allowed');
  return ok;
}
