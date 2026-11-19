import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import i18n from '../../i18n';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../../i18n/testing/pseudo';
import { copyRichText } from '../../utils/clipboard';
import { CopyActions } from './CopyActions';

vi.mock('../../utils/clipboard', () => ({ copyRichText: vi.fn(async () => 'rich') }));

beforeEach(async () => { await installPseudoLocale(); });
afterEach(async () => { cleanup(); await restoreLocale(); });

describe('manual PIMS copy controls (pseudo-locale)', () => {
  it.each(['rich', 'plain', 'prompt'] as const)('translates actions and the %s outcome', async (outcome) => {
    vi.mocked(copyRichText).mockResolvedValue(outcome);
    render(<CopyActions note={{ sections: [{ key: 'exam', heading: 'Exam', lines: ['Existing clinical text'] }] }}
      storedText={null} renderImage={async () => null} />);
    fireEvent.click(screen.getByText(i18n.t('pims:copy.sections')));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:copy.all') }));
    await screen.findByRole('status');
    expect(findUntranslated(document.body)).toEqual([]);
  });

  it('translates failures without exposing technical details', async () => {
    vi.mocked(copyRichText).mockRejectedValue(new TypeError());
    render(<CopyActions note={{ sections: [] }} storedText="Edited clinical text" />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:copy.all') }));
    await screen.findByRole('alert');
    expect(findUntranslated(document.body)).toEqual([]);
  });
});
