// Side panel entry (sidepanel.html). Importing i18n initialises it in English; the panel then
// applies the account's language, else the browser's (panelLanguage.ts).
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../i18n';
import { SidePanelApp } from './SidePanelApp';
import '../../styles/themes.css';
import '../../styles/controls.css';
import './sidepanel.css';
import { initAppearance } from '../../theme/appearance';
import { AppearanceSelect } from '../../theme/AppearanceSelect';

initAppearance();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SidePanelApp />
    <footer className="sp-appearance"><AppearanceSelect disclosure /></footer>
  </React.StrictMode>,
);
