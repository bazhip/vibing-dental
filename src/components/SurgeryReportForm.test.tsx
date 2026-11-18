import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const store = vi.hoisted(() => ({
  enabled: true,
  loaded: true,
  templates: [{ id: 't1', name: 'Cleaning', body: 'Scaled and polished.' }],
  create: vi.fn(), update: vi.fn(), remove: vi.fn(),
}));
vi.mock('../hooks/useReportTemplates', () => ({ useReportTemplates: () => store }));
import { SurgeryReportForm } from './SurgeryReportForm';

beforeEach(() => { vi.clearAllMocks(); store.enabled = true; });

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
    expect(report).toHaveAttribute('readonly');
    // Saving the report as a template doesn't change the chart.
    expect(screen.getByRole('button', { name: 'Save as template' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save as template' })).toHaveAttribute('data-lock-exempt');
    fireEvent.change(report, { target: { value: 'Attempted edit' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Insert a report template' }), { target: { value: 't1' } });
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

  it('continues appending inserted templates on editable visits', () => {
    const onChange = vi.fn();
    render(<SurgeryReportForm value="Existing notes" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Insert a report template' }), { target: { value: 't1' } });
    expect(onChange).toHaveBeenCalledWith('Existing notes\n\nScaled and polished.');
  });
});
