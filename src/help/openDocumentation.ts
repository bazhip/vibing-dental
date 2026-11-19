import { isAppLanguage } from '../i18n/config';
import type { HelpTopic } from './topics';

export function documentationUrl(language: string, topic?: HelpTopic) {
  const url = new URL('/help/', window.location.origin);
  if (isAppLanguage(language)) url.searchParams.set('lang', language);
  if (topic) url.hash = topic;
  return url.href;
}

export function openDocumentation(language: string, topic?: HelpTopic) {
  window.open(documentationUrl(language, topic), '_blank', 'noopener,noreferrer');
}
