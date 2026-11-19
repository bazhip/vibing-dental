import { isAppLanguage } from '../i18n/config';

export function openDocumentation(language: string) {
  const url = new URL('/help/', window.location.origin);
  if (isAppLanguage(language)) url.searchParams.set('lang', language);
  window.open(url.href, '_blank', 'noopener,noreferrer');
}
