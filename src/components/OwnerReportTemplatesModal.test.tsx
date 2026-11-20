import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import i18n, { loadLanguage } from '../i18n';
import { OwnerReportTemplatesModal } from './OwnerReportTemplatesModal';
import { OwnerReportConfig, defaultConfig, defaultTemplate } from '../utils/ownerReportConfig';

import { DialogHost } from './ui/dialogs';
import * as dialogs from './ui/dialogs';

const branding = { practiceName: 'SoCal Vet', doctorName: 'Dr. Alice Ng', logoUrl: '' };

const renderModal = (props: Partial<Parameters<typeof OwnerReportTemplatesModal>[0]> = {}) =>
  render(
    <OwnerReportTemplatesModal
      open
      onClose={() => {}}
      config={defaultConfig()}
      onSave={vi.fn().mockResolvedValue(undefined)}
      canEdit
      roleKnown
      branding={branding}
      {...props}
    />
  );

describe('OwnerReportTemplatesModal', () => {
  it('lists the practice templates with the default marked', () => {
    const config: OwnerReportConfig = {
      defaultTemplateId: 'b',
      templates: [
        { ...defaultTemplate(), id: 'a', name: 'Standard' },
        { ...defaultTemplate(), id: 'b', name: 'Español', language: 'es' },
      ],
    };
    renderModal({ config });

    const list = within(screen.getByRole('group', { name: 'Report template' }));
    expect(list.getByRole('button', { name: 'Standard', pressed: false })).toBeInTheDocument();
    expect(list.getByRole('button', { name: /Español.*Spanish.*Default/, pressed: true })).toBeInTheDocument();
  });

  it('owners can disable a section and save', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderModal({ onSave, onClose });

    await user.click(screen.getByRole('button', { name: 'Report content' }));
    await user.click(screen.getByRole('checkbox', { name: 'Teeth removed' }));

    const save = screen.getByRole('button', { name: 'Save templates' });
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0] as OwnerReportConfig;
    const extractions = saved.templates[0].sections.find((s) => s.id === 'extractions');
    expect(extractions?.enabled).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('disables template mutations while saving', async () => {
    let finish!: () => void;
    const onSave = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    const config = { defaultTemplateId: 'a', templates: [{ ...defaultTemplate(), id: 'a', name: 'First' }, { ...defaultTemplate(), id: 'b', name: 'Second' }] };
    renderModal({ config, onSave });
    await user.click(screen.getByRole('button', { name: 'Second' }));
    await user.type(screen.getByLabelText('Template name'), '!');
    await user.click(screen.getByRole('button', { name: 'Save templates' }));
    expect(screen.getByRole('button', { name: 'New template' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Template actions' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Second!', pressed: true })).toBeDisabled();
    await act(async () => finish());
  });

  it('Save stays disabled until something changes', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Save templates' })).toBeDisabled();
  });

  it('non-owners get a read-only view with a note instead of Save', () => {
    renderModal({ canEdit: false });
    expect(screen.getByText(/Only practice owners can edit/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save templates' })).not.toBeInTheDocument();
    // Fields are disabled (fieldset) — check one representative input.
    expect(screen.getByLabelText('Template name')).toBeDisabled();
    // The header × and the footer button both read "Close".
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0);
  });

  it('adds a custom section and edits its heading and body', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderModal({ onSave });

    await user.click(screen.getByRole('button', { name: 'Report content' }));
    await user.click(screen.getByRole('button', { name: '+ Add a custom text section' }));
    await user.type(screen.getByLabelText('Custom section heading'), 'Payment plans');
    await user.type(screen.getByLabelText('Section text'), 'CareCredit available');

    await user.click(screen.getByRole('button', { name: 'Save templates' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0] as OwnerReportConfig;
    const custom = saved.templates[0].sections.find((s) => s.id.startsWith('custom-'));
    expect(custom).toMatchObject({ enabled: true, title: 'Payment plans', body: 'CareCredit available' });
  });

  it('asks before discarding with explicit Keep editing and Discard actions', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<DialogHost />);
    renderModal({ onClose });
    await user.type(screen.getByLabelText('Template name'), '!');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Keep Editing' }));
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Template name') as HTMLInputElement).value).toContain('!');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Discard Changes' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('keeps keyboard focus in the discard confirmation above the editor', async () => {
    const visible = vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockReturnValue(document.body);
    const user = userEvent.setup();
    render(<DialogHost />);
    renderModal();
    await user.type(screen.getByLabelText('Template name'), '!');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const confirmation = await screen.findByRole('alertdialog');
    const keep = within(confirmation).getByRole('button', { name: 'Keep Editing' });
    const discard = within(confirmation).getByRole('button', { name: 'Discard Changes' });
    discard.focus();
    fireEvent.keyDown(discard, { key: 'Tab' });
    expect(keep).toHaveFocus();
    fireEvent.keyDown(keep, { key: 'Tab', shiftKey: true });
    expect(discard).toHaveFocus();
    await user.click(keep);
    visible.mockRestore();
  });

  it('does not apply a stale discard approval to a newer draft or enqueue twice', async () => {
    let approve!: (value: boolean) => void;
    const confirm = vi.spyOn(dialogs, 'confirmDialog').mockImplementation(() => new Promise((resolve) => { approve = resolve; }));
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'First draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(confirm).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Newer draft' } });
    await act(async () => approve(true));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Template name')).toHaveValue('Newer draft');
    confirm.mockRestore();
  });

  it('deletes only after explicit confirmation and preserves the draft when cancelled', async () => {
    const user = userEvent.setup();
    const config = { defaultTemplateId: 'a', templates: [{ ...defaultTemplate(), id: 'a', name: 'First' }, { ...defaultTemplate(), id: 'b', name: 'Second' }] };
    render(<DialogHost />);
    renderModal({ config });
    await user.click(screen.getByRole('button', { name: 'Template actions' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const cancel = within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' });
    await user.click(cancel);
    expect(screen.getByLabelText('Template name')).toHaveValue('First');
    await user.click(screen.getByRole('button', { name: 'Template actions' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByLabelText('Template name')).toHaveValue('Second'));
  });

  it('can duplicate a template and set the copy as default', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const config = defaultConfig();
    renderModal({ config, onSave });

    await user.click(screen.getByRole('button', { name: 'Template actions' }));
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    await user.click(screen.getByRole('button', { name: 'Template actions' }));
    await user.click(screen.getByRole('button', { name: 'Set as default' }));

    await user.click(screen.getByRole('button', { name: 'Save templates' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0] as OwnerReportConfig;
    expect(saved.templates).toHaveLength(2);
    expect(saved.templates.find((t) => t.name === 'Standard (copy)')).toBeDefined();
    expect(saved.defaultTemplateId).not.toBe(config.defaultTemplateId);
  });

  it('swaps the report language, which re-labels the generated headings', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderModal({ onSave });

    // The default report title follows the language when untouched.
    expect(screen.getByLabelText('Report title')).toHaveValue('Dental Visit Report');
    await user.selectOptions(screen.getByLabelText('Report language'), 'es');
    expect(screen.getByLabelText('Report title')).toHaveValue('Informe de la visita dental');

    await user.click(screen.getByRole('button', { name: 'Save templates' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0] as OwnerReportConfig;
    expect(saved.templates[0].language).toBe('es');
  });

  it('placeholder chips insert into the focused field', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: 'Report content' }));
    const intro = screen.getByLabelText('Opening summary template');
    await user.click(intro);
    await user.click(screen.getByRole('button', { name: '{owner}' }));
    expect(intro).toHaveValue('{owner}');
    // Capitalized chips capitalize the value.
    await user.click(screen.getByRole('button', { name: '{pet}' }));
    expect(intro).toHaveValue('{owner}{pet}');
  });

  it('shows supported personalization fields detected in the current draft', async () => {
    const config = defaultConfig();
    config.templates[0].footer = '{Practice} · {unknown}';
    renderModal({ config });
    await userEvent.click(screen.getByRole('button', { name: 'Report content' }));
    fireEvent.change(screen.getByLabelText('Opening summary template'), { target: { value: 'Hello {Pet} and {owner}.' } });
    const fields = screen.getByRole('list', { name: 'Fields in this template' });
    expect(within(fields).getAllByRole('listitem').map(item => item.textContent)).toEqual(['{Pet}', '{owner}', '{Practice}']);
  });

  it('when the saved templates failed to load, it says so and keeps Save off — even after an edit', async () => {
    renderModal({ loadFailed: true });
    expect(screen.getByRole('alert')).toHaveTextContent(/didn’t load/);
    await userEvent.type(screen.getByLabelText('Report title'), ' X');
    expect(screen.getByRole('button', { name: /Save templates/ })).toBeDisabled();
  });

  describe('save failure message', () => {
    afterEach(async () => { await i18n.changeLanguage('en'); });
    const failSave = async (raw: string) => {
      const user = userEvent.setup();
      renderModal({ onSave: vi.fn().mockRejectedValue(new Error(raw)) });
      await user.click(screen.getByRole('button', { name: /Report content|Contenu du rapport/ }));
      await user.click(screen.getByRole('checkbox', { name: /Teeth removed|Dents extraites/ }));
      await user.click(screen.getByRole('button', { name: /Save templates|Enregistrer/ }));
    };

    it('shows raw text bare in English', async () => {
      await failSave('boom');
      expect(await screen.findByText('boom')).toBeInTheDocument();
    });

    it('wraps raw text in French', async () => {
      await loadLanguage('fr');
      await i18n.changeLanguage('fr');
      await failSave('boom');
      expect(await screen.findByText('Une erreur s’est produite (détails : boom)')).toBeInTheDocument();
    });
  });
});

describe('web template editor categories', () => {
  it('shows one category at a time and retains edits across category changes', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderModal({ onSave });
    expect(screen.getByRole('navigation', { name: 'Template settings' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Opening summary template' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Report content' }));
    await user.type(screen.getByRole('textbox', { name: 'Opening summary template' }), 'A careful summary.');
    await user.click(screen.getByRole('button', { name: 'Closing and footer' }));
    await user.type(screen.getByLabelText('Closing note'), 'Contact the practice.');
    await user.click(screen.getByRole('button', { name: 'Report content' }));
    expect(screen.getByRole('textbox', { name: 'Opening summary template' })).toHaveValue('A careful summary.');
    await user.click(screen.getByRole('button', { name: 'Save templates' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].templates[0]).toMatchObject({ introTemplate: 'A careful summary.', closingNote: 'Contact the practice.' });
  });

  it('supports the compact category picker and direct template choices without losing edits', async () => {
    const user = userEvent.setup();
    const config = defaultConfig();
    config.templates.push({ ...defaultTemplate(), id: 'second', name: 'Second template' });
    renderModal({ config });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Template settings' }), 'closing');
    await user.type(screen.getByLabelText('Closing note'), 'First template note');
    const templates = within(screen.getByRole('group', { name: 'Report template' }));
    const first = templates.getByRole('button', { name: /Standard/, pressed: true });
    await user.click(first);
    expect(screen.getByLabelText('Closing note')).toHaveValue('First template note');
    await user.click(templates.getByRole('button', { name: 'Second template', pressed: false }));
    expect(screen.getByLabelText('Closing note')).toHaveValue('');
    await user.click(first);
    expect(screen.getByLabelText('Closing note')).toHaveValue('First template note');
  });

  it('keeps categories navigable in read-only mode', async () => {
    renderModal({ canEdit: false });
    await userEvent.click(screen.getByRole('button', { name: 'Closing and footer' }));
    expect(screen.getByLabelText('Closing note')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Preview with sample visit' })).toBeEnabled();
  });
});

it('template management disclosure exposes its state without changing the draft', async () => {
  const user = userEvent.setup();
  renderModal();
  const toggle = screen.getByRole('button', { name: 'Template actions' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const actions = document.getElementById(toggle.getAttribute('aria-controls')!);
  expect(actions).toHaveAttribute('hidden');
  await user.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(actions).not.toHaveAttribute('hidden');
  expect(screen.getByRole('button', { name: 'Duplicate' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save templates' })).toBeDisabled();
  screen.getByRole('button', { name: 'Duplicate' }).focus();
  await user.keyboard('{Escape}');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(toggle).toHaveFocus();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('keeps secondary template actions in a disclosure in the native editor', async () => {
  renderModal({ presentation: 'screen' });
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Template actions' }));
  expect(screen.getByRole('button', { name: 'Duplicate' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
});

it('opens a new template draft in the practice client language', () => {
  renderModal({ startNew: true, clientLanguage: 'fr' });
  expect(screen.getByRole('textbox', { name: 'Template name' })).toHaveValue('New template');
  expect(screen.getByRole('combobox', { name: 'Report language' })).toHaveValue('fr');
  expect(screen.getByRole('button', { name: 'Save templates' })).toBeEnabled();
});
