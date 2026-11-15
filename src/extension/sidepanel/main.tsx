// Side panel entry (sidepanel.html). Importing i18n initialises it in English; the panel then
// applies the account's language, else the browser's (panelLanguage.ts).
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../i18n';
import { SidePanelApp } from './SidePanelApp';
import './sidepanel.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SidePanelApp />
  </React.StrictMode>,
);
