import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import i18n from '../i18n';
import { findUntranslated, installPseudoLocale, restoreLocale } from '../i18n/testing/pseudo';
import { DocumentToolbar } from './DocumentToolbar';

const viewport = vi.hoisted(() => ({ compact: true }));
vi.mock('./PdfStylePicker', () => ({ useCompactPdfLayout: () => viewport.compact }));

beforeEach(async () => { await installPseudoLocale(); });
afterEach(async () => { cleanup(); await restoreLocale(); });

it.each([true, false])('keeps export available and uses the viewport only for initial expansion (%s)', compact => {
  viewport.compact = compact;
  render(<DocumentToolbar actions={<button>{i18n.t('pdfui:preview.download')}</button>}>
    <h3>{i18n.t('media:documents.color')}</h3>
  </DocumentToolbar>);
  const toggle = screen.getByRole('button', { name: '⟦Customize⟧' });
  expect(screen.getByRole('button', { name: '⟦Download PDF⟧' })).toBeVisible();
  const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!;
  const heading = within(panel).getByRole('heading', { hidden: true });
  expect(heading).toHaveTextContent('⟦Color⟧');
  expect(toggle).toHaveAttribute('aria-expanded', String(!compact));
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', String(compact));
  expect(findUntranslated(document.body, ['▾', '▴'])).toEqual([]);
});
