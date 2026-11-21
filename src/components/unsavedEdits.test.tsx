import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Editors must never drop unsaved edits silently.

vi.mock('../native/platform', () => ({ isNativeApp: () => false, WEB_ORIGIN: 'https://toothops.app/' }));
const confirm = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => false));
vi.mock('./ui/dialogs', async (orig) => ({
  ...(await orig<typeof import('./ui/dialogs')>()),
  confirmDialog: confirm,
  toast: vi.fn(),
}));
vi.mock('../hooks/useTeam', () => ({ useTeam: () => ({ enabled: true, loaded: true, role: 'owner', practice: { id: 'p1', name: 'Elm Vet' }, members: [] }) }));
// One stable object, as the real hook returns (a new template each render
// would re-seed the form and wipe the edit).
const reminderTemplate = vi.hoisted(() => ({
  loaded: true,
  template: { subject: 'Recheck for {{patient}}', body: 'Hello {{owner}}', auto: false, leadDays: 7 },
  save: () => Promise.resolve(),
}));
vi.mock('../hooks/useReminderTemplate', () => ({ useReminderTemplate: () => reminderTemplate }));

import { ReportTemplatesModal } from './ReportTemplatesModal';
import { RemindersModal } from './RemindersModal';
import type { UseReportTemplatesReturn } from '../hooks/useReportTemplates';

const store = (): UseReportTemplatesReturn => ({
  enabled: true, loaded: true,
  templates: [{ id: 't1', name: 'Dental', body: 'Cleaning done.' }, { id: 't2', name: 'Extraction', body: 'Tooth out.' }],
  create: vi.fn(async (name: string, body: string) => ({ id: 'n1', name, body })),
  update: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
} as unknown as UseReportTemplatesReturn);

beforeEach(() => { confirm.mockReset(); confirm.mockResolvedValue(false); });

describe('Report templates editor', () => {
  it('asks before Close, ×, picking another template or New drops an edit; keeps the edit when told to', async () => {
    const onClose = vi.fn();
    render(<ReportTemplatesModal open onClose={onClose} store={store()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dental' }));
    await waitFor(() => expect(screen.getByLabelText('Report text')).toHaveValue('Cleaning done.'));
    fireEvent.change(screen.getByLabelText('Report text'), { target: { value: 'Cleaning done. Edited.' } });

    const closeX = () => document.querySelector<HTMLButtonElement>('.pdf-preview-close')!;
    const footerClose = () => screen.getAllByRole('button', { name: 'Close' }).find((b) => b !== closeX())!;
    for (const button of [closeX, footerClose, () => screen.getByRole('button', { name: 'Extraction' }), () => screen.getByRole('button', { name: 'Create template' })]) {
      fireEvent.click(button());
      await waitFor(() => expect(confirm).toHaveBeenCalled());
      confirm.mockClear();
    }
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Report text')).toHaveValue('Cleaning done. Edited.');

    confirm.mockResolvedValue(true); // Discard
    fireEvent.click(footerClose());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('switches and closes without asking when nothing changed, or after saving', async () => {
    const onClose = vi.fn();
    render(<ReportTemplatesModal open onClose={onClose} store={store()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dental' }));
    await waitFor(() => expect(screen.getByLabelText('Report text')).toHaveValue('Cleaning done.'));
    fireEvent.click(screen.getByRole('button', { name: 'Extraction' }));
    await waitFor(() => expect(screen.getByLabelText('Report text')).toHaveValue('Tooth out.'));
    fireEvent.change(screen.getByLabelText('Report text'), { target: { value: 'Tooth out. Edited.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled());
    fireEvent.click(document.querySelector<HTMLButtonElement>('.pdf-preview-close')!);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('Recheck reminders editor', () => {
  it('the × asks before dropping an edited template (as Escape and the backdrop did)', async () => {
    const onClose = vi.fn();
    const { container } = render(<RemindersModal open onClose={onClose} />);
    const subject = Array.from(container.querySelectorAll<HTMLInputElement>('input.patient-form__input'))
      .find((i) => i.value === 'Recheck for {{patient}}')!;
    fireEvent.change(subject, { target: { value: 'Edited subject' } });
    fireEvent.click(document.querySelector<HTMLButtonElement>('.pdf-preview-close')!);
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
