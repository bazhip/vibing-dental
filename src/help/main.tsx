import '../i18n';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { isAppLanguage } from '../i18n/config';
import { bootLanguage } from '../i18n/bootLanguage';
import i18n from '../i18n';
import '../styles/themes.css';
import { HelpSite } from './HelpSite';

const requestedLanguage = new URLSearchParams(window.location.search).get('lang');
const ready = isAppLanguage(requestedLanguage)
  ? i18n.changeLanguage(requestedLanguage)
  : bootLanguage();

void Promise.resolve(ready).finally(() => {
  createRoot(document.getElementById('help-root')!).render(<HelpSite />);
});
