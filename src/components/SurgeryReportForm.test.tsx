import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const store = vi.hoisted(() => ({
  enabled: true,
  loaded: true,
  templates: [{ id: 't1', name: 'Cleaning', body: 'Scaled and polished.' }],
  create: vi.fn(), update: vi.fn(), remove: vi.fn(),
}));
vi.mock('../hooks/useReportTemplates', () => ({ useReportTemplates: () => store }));
import { SurgeryReportForm } from './SurgeryReportForm';
import { DialogHost } from './ui/dialogs';

beforeEach(() => { vi.clearAllMocks(); store.enabled = true; store.templates = [{ id: 't1', name: 'Cleaning', body: 'Scaled and polished.' }]; });

describe('treatment report customization', () => {
  it('opens template management from the Customize header action', async () => {
    render(<SurgeryReportForm value="" onChange={vi.fn()} />);
    const customize = screen.getByRole('button', { name: 'Customize' });
    expect(customize.closest('.patient-form__header')).not.toBeNull();
    expect(customize).toHaveAttribute('title', 'Manage treatment report templates');
    expect(screen.queryByRole('button', { name: 'Edit templates' })).toBeNull();
    await userEvent.click(customize);
    expect(screen.getByRole('dialog', { name: 'Report templates' })).toBeInTheDocument();
  });

  it('allows template management on read-only visits without changing the report', async () => {
    const onChange = vi.fn();
    render(<SurgeryReportForm value="Saved visit text" onChange={onChange} readOnly />);
    const report = screen.getByRole('textbox', { name: 'Treatment report' });
    expect(report).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cleaning' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New template' })).toBeDisabled();
    fireEvent.change(report, { target: { value: 'Attempted edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cleaning' }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Customize' }));
    expect(screen.getByRole('dialog', { name: 'Report templates' })).toBeInTheDocument();
    expect(store.create).not.toHaveBeenCalled();
  });

  it('hides template controls when cloud access is disabled', () => {
    render(<SurgeryReportForm value="" onChange={vi.fn()} cloudActive={false} />);
    expect(screen.queryByRole('button', { name: 'Customize' })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('shows options directly and confirms before replacing existing wording', async () => {
    const onChange = vi.fn();
    render(<><SurgeryReportForm value="Existing notes" onChange={onChange} /><DialogHost /></>);
    expect(screen.queryByRole('combobox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Cleaning' }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Use template' }));
    expect(onChange).toHaveBeenCalledWith('Scaled and polished.');
  });
  it('does not reinsert the selected template even when its wording was edited', () => {
    const onApplyTemplate = vi.fn();
    render(<SurgeryReportForm value="Updated wording" templateId="t1" onApplyTemplate={onApplyTemplate} onChange={vi.fn()} />);
    const active = screen.getByRole('button', { name: 'Cleaning', pressed: true });
    fireEvent.click(active);
    expect(onApplyTemplate).not.toHaveBeenCalled();
  });
});

it('creates a new template from a blank report and saves its prompts as written', async () => {
  const body = 'Teeth extracted: {Enter tooth numbers}.';
  store.create.mockResolvedValueOnce({ id: 'new', name: 'Extraction', body });
  render(<SurgeryReportForm value="" onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'New template' }));
  const editor = screen.getByRole('dialog', { name: 'New template' });
  expect(within(editor).getByRole('textbox', { name: 'Report text' })).toHaveAccessibleDescription(/braces/);
  fireEvent.change(within(editor).getByRole('textbox', { name: 'Template name' }), { target: { value: 'Extraction' } });
  fireEvent.change(within(editor).getByRole('textbox', { name: 'Report text' }), { target: { value: body } });
  expect(within(editor).getByText('Fields in this template')).toBeVisible();
  expect(within(editor).getByText('{Enter tooth numbers}')).toBeVisible();
  fireEvent.click(within(editor).getByRole('button', { name: 'Save template' }));
  await waitFor(() => expect(editor).not.toBeInTheDocument());
  expect(store.create).toHaveBeenCalledWith('Extraction', body);
});

it('asks for each named field once before applying the completed template', async () => {
  store.templates = [{ id: 't1', name: 'Extraction', body: 'Teeth: {Enter tooth numbers}. Site: {Enter tooth numbers}. {{Code}}' }];
  const onChange = vi.fn();
  render(<><SurgeryReportForm value="Existing notes" onChange={onChange} /><DialogHost /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Extraction' }));
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Use template' }));
  const field = await screen.findByRole('textbox', { name: 'Enter tooth numbers' });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: '108' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith('Teeth: 108. Site: 108. {{Code}}'));
});

it('lists all chart codes and offers keyboard and mouse insertion after a brace', async () => {
  render(<SurgeryReportForm value="" onChange={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'New template' }));
  const dialog = screen.getByRole('dialog', { name: 'New template' });
  for (const code of ['pet', 'owner', 'species', 'date', 'practice', 'doctor']) {
    expect(within(dialog).getByRole('button', { name: `{${code}}` })).toBeVisible();
  }
  const body = within(dialog).getByRole('textbox', { name: 'Report text' });
  fireEvent.change(body, { target: { value: 'Patient: {' } });
  const codes = within(dialog).getByRole('list', { name: 'Chart codes' });
  expect(within(codes).getAllByRole('button')).toHaveLength(6);
  fireEvent.keyDown(body, { key: 'ArrowDown' });
  fireEvent.keyDown(body, { key: 'Enter' });
  expect(body).toHaveValue('Patient: {pet}');
  fireEvent.change(body, { target: { value: 'Patient: {pet}. Seen by {do' } });
  const narrowed = within(dialog).getByRole('list', { name: 'Chart codes' });
  expect(within(narrowed).getAllByRole('button')).toHaveLength(1);
  await userEvent.click(within(narrowed).getByRole('button', { name: /doctor/ }));
  expect(body).toHaveValue('Patient: {pet}. Seen by {doctor}');
});

it('fills every chart code with recorded values and preserves double braces', async () => {
  store.templates = [{ id: 't1', name: 'Visit', body: '{pet} {owner} {species} {date} {practice} {doctor} {{owner}}' }];
  const apply = vi.fn();
  render(<SurgeryReportForm value="" chartFields={{
    pet: 'Milo', owner: 'Sam', species: 'Feline', date: '2026-11-18', practice: 'Elm Vet', doctor: 'Dr Rivera',
  }} onChange={vi.fn()} onApplyTemplate={apply} />);
  await userEvent.click(screen.getByRole('button', { name: 'Visit' }));
  expect(apply).toHaveBeenCalledWith('Milo Sam Feline 2026-11-18 Elm Vet Dr Rivera {{owner}}', 't1');
});
