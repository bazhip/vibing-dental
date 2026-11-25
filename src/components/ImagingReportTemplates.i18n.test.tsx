import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import i18n from '../i18n';
import { ImagingReportTemplates } from './ImagingReportTemplates';

vi.mock('../hooks/useReportTemplates', () => ({
  useReportTemplates: () => ({ enabled: true, loaded: true, templates: [], create: vi.fn(), update: vi.fn(), remove: vi.fn() }),
}));
// Fill-in codes are literal tokens, not copy.
const codes = ['{pet}', '{owner}', '{species}', '{date}', '{practice}', '{doctor}'];
beforeEach(async () => installPseudoLocale());
afterEach(async () => { cleanup(); await restoreLocale(); });

it.each(['radiology', 'ct'] as const)('translates the %s template picker and editor', kind => {
  render(<ImagingReportTemplates kind={kind} value="" onApply={vi.fn()} />);
  expect(findUntranslated(document.body, codes)).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('visitDocumentation:consultation.templates.manage') }));
  expect(findUntranslated(document.body, codes)).toEqual([]);
});
