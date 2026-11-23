import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { findUntranslated, installPseudoLocale, restoreLocale } from '../i18n/testing/pseudo';
import i18n from '../i18n';
import { DEFAULT_CHART_PREFS } from '../utils/chartSettings';
import { ImagingLayoutRows, PatientLayoutRows } from './ChartLayoutRows';

test('keyboard reorder, remove and restore use the shared translated field controls', async () => {
  installPseudoLocale();
  function Editor() {
    const [prefs, setPrefs] = useState(DEFAULT_CHART_PREFS);
    return <ImagingLayoutRows prefs={prefs} onChange={patch => setPrefs(previous => ({ ...previous, ...patch }))} />;
  }
  try {
    const { container } = render(<Editor />);
    const ct = i18n.t('app:ct.title');
    fireEvent.keyDown(screen.getByRole('button', { name: i18n.t('visitDocumentation:consultation.templates.builder.dragField', { field: ct }) }), { key: 'ArrowUp' });
    expect(container.querySelector('[data-layout-row="0"]')).toHaveTextContent(ct);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('visitDocumentation:consultation.templates.builder.removeNamed', { field: ct }) }));
    expect(screen.queryByText(ct)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i18n.t('forms:exam.layout.add').replace(/[⟦⟧]/g, '')) }));
    expect(findUntranslated(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: ct }));
    expect(container.querySelector('[data-layout-row="1"]')).toHaveTextContent(ct);
  } finally {
    await restoreLocale();
  }
});

test('Patient layout renders translated owner and visit controls', async () => {
  installPseudoLocale();
  try {
    const { container } = render(<PatientLayoutRows prefs={DEFAULT_CHART_PREFS} onChange={() => {}} />);
    expect(findUntranslated(container)).toEqual([]);
  } finally {
    await restoreLocale();
  }
});
