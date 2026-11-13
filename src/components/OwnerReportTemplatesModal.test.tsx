import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { OwnerReportTemplatesModal } from './OwnerReportTemplatesModal';
import { OwnerReportConfig, defaultConfig, defaultTemplate } from '../utils/ownerReportConfig';

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

    const list = screen.getByRole('navigation', { name: 'Templates' });
    expect(list).toHaveTextContent('Standard');
    expect(list).toHaveTextContent('Español');
    // The default badge lands on template b, and the non-English one
    // shows its language.
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('ES')).toBeInTheDocument();
  });

  it('owners can disable a section and save', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderModal({ onSave, onClose });

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

    await user.click(screen.getByRole('button', { name: '+ Add a custom text section' }));
    await user.type(screen.getByLabelText('Custom section heading'), 'Payment plans');
    await user.type(screen.getByLabelText('Section text'), 'CareCredit available');

    await user.click(screen.getByRole('button', { name: 'Save templates' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0] as OwnerReportConfig;
    const custom = saved.templates[0].sections.find((s) => s.id.startsWith('custom-'));
    expect(custom).toMatchObject({ enabled: true, title: 'Payment plans', body: 'CareCredit available' });
  });

  it('asks before discarding unsaved changes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { unmount } = renderModal({ onClose });

    // Make a change first — an unchanged dialog closes without asking.
    await user.type(screen.getByLabelText('Template name'), '!');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirmSpy.mock.calls[0]?.[0]).toMatch(/discard/i);
    expect(onClose).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    confirmSpy.mockRestore();
    unmount();
  });

  it('can duplicate a template and set the copy as default', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const config = defaultConfig();
    renderModal({ config, onSave });

    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
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

  it('deleting the last remaining template is not offered', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('placeholder chips insert into the focused field', async () => {
    const user = userEvent.setup();
    renderModal();
    const intro = screen.getByLabelText('Opening summary template');
    await user.click(intro);
    await user.click(screen.getByRole('button', { name: '{owner}' }));
    expect(intro).toHaveValue('{owner}');
    // Capitalized chips capitalize the value.
    await user.click(screen.getByRole('button', { name: '{pet}' }));
    expect(intro).toHaveValue('{owner}{pet}');
  });

  it('when the saved templates failed to load, it says so and keeps Save off — even after an edit', async () => {
    renderModal({ loadFailed: true });
    expect(screen.getByRole('alert')).toHaveTextContent(/didn’t load/);
    await userEvent.type(screen.getByLabelText('Report title'), ' X');
    expect(screen.getByRole('button', { name: /Save templates/ })).toBeDisabled();
  });
});
