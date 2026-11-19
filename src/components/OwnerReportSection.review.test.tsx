import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi } from 'vitest';
import { OwnerReportSection } from './OwnerReportSection';
import { buildOwnerReportModel } from '../utils/ownerReport';
import { sampleOwnerReportSnapshot } from '../utils/ownerReportSample';

it.each([false, true])('allows preview without review for readOnly=%s', (readOnly) => {
  const snapshot = { ...sampleOwnerReportSnapshot(), ownerReport: {} };
  render(<OwnerReportSection snapshot={snapshot} overrides={{}} onOverrideChange={vi.fn()} onPreview={vi.fn()} readOnly={readOnly} />);
  expect(screen.queryByText('Draft — review required')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Confirm review and completion' })).toBeNull();
  expect(screen.getByRole('button', { name: /preview/i })).toBeEnabled();
});

it('shows recorded discharge notes in the editor and preserves an explicitly cleared report override',()=>{
 const snapshot={...sampleOwnerReportSnapshot(),ownerReport:{}};
 snapshot.patientInfo.dischargeInstructions='Recorded home-care instruction for this visit.';
 const change=vi.fn();const view=render(<OwnerReportSection snapshot={snapshot} overrides={{}} onOverrideChange={change} onPreview={vi.fn()}/>);
 const editor=screen.getByLabelText(/A note from your veterinary team/);
 expect(editor).toHaveValue(buildOwnerReportModel(snapshot).extraNotes);
 fireEvent.change(editor,{target:{value:''}});
 expect(change).toHaveBeenCalledWith('extraNotes','');
 const overrides={extraNotes:''};
 view.rerender(<OwnerReportSection snapshot={{...snapshot,ownerReport:overrides}} overrides={overrides} onOverrideChange={change} onPreview={vi.fn()}/>);
 expect(screen.getByLabelText(/A note from your veterinary team/)).toHaveValue('');
 expect(buildOwnerReportModel({...snapshot,ownerReport:overrides}).extraNotes).toBe('');
 const label=screen.getByLabelText(/A note from your veterinary team/).closest<HTMLElement>('.owner-report__block')!;
 fireEvent.click(within(label).getByRole('button',{name:'Restore generated'}));
 expect(change).toHaveBeenLastCalledWith('extraNotes',null);
});

it('edits generated findings independently of the chart and can restore chart wording', () => {
  const snapshot = sampleOwnerReportSnapshot();
  const change = vi.fn();
  const view = render(<OwnerReportSection snapshot={snapshot} overrides={{}} onOverrideChange={change} onPreview={vi.fn()} aiEnabled />);
  expect(screen.queryByRole('textbox', { name: 'Findings' })).toBeNull();
  expect(screen.getByText('Report findings').closest('section')?.querySelector('.refine-text__control')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Edit Findings' }));
  const findings = screen.getByRole('textbox', { name: 'Findings' });
  expect((findings as HTMLTextAreaElement).value.trim()).not.toBe('');
  fireEvent.change(findings, { target: { value: 'Custom owner-facing findings.' } });
  expect(change).toHaveBeenCalledWith('findingsText', 'Custom owner-facing findings.');
  const overrides = { findingsText: 'Custom owner-facing findings.' };
  view.rerender(<OwnerReportSection snapshot={{ ...snapshot, ownerReport: overrides }} overrides={overrides} onOverrideChange={change} onPreview={vi.fn()} aiEnabled />);
  expect(findings).toHaveValue(overrides.findingsText);
  expect(findings.closest('.owner-report__block')?.querySelector('.refine-text__control')).toBeInTheDocument();
  fireEvent.click(within(findings.closest('.owner-report__block') as HTMLElement).getByRole('button', { name: 'Restore generated' }));
  expect(change).toHaveBeenLastCalledWith('findingsText', null);
});

it('keeps Refine disabled on the template wording until the wording changes', () => {
  const snapshot = sampleOwnerReportSnapshot();
  const props = { snapshot, overrides: {}, onOverrideChange: vi.fn(), onPreview: vi.fn(), aiEnabled: true };
  const { rerender } = render(<OwnerReportSection {...props} />);
  const block = screen.getByLabelText('Opening summary').closest('.owner-report__block') as HTMLElement;
  expect(within(block).getByRole('button', { name: 'Refine' })).toBeDisabled();
  rerender(<OwnerReportSection {...props} overrides={{ intro: 'Edited opening.' }} />);
  expect(within(block).getByText('Refine').closest('summary')).toBeInTheDocument();
});

it('makes the practice template visible and places Preview before Customize', () => {
  const preview = vi.fn();
  render(<OwnerReportSection snapshot={sampleOwnerReportSnapshot()} overrides={{}} onOverrideChange={vi.fn()}
    onPreview={preview} onCustomize={vi.fn()} />);
  const button = screen.getByRole('button', { name: 'Preview owner report' });
  const customize = screen.getByRole('button', { name: 'Customize' });
  expect(button.parentElement).toBe(customize.parentElement);
  expect(button.compareDocumentPosition(customize) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Report template' })).toHaveDisplayValue('Practice default (Standard)');
  fireEvent.click(button);
  expect(preview).toHaveBeenCalledOnce();
});

it('protects generated wording from refinement and restores it after a manual edit', () => {
  const snapshot = sampleOwnerReportSnapshot();
  const generated = { generatedHomecare: 'Feed the recorded soft diet.' };
  const onOverrideChange = vi.fn();
  const props = { onOverrideChange, onPreview: vi.fn(), aiEnabled: true };
  const { rerender } = render(<OwnerReportSection {...props} snapshot={{ ...snapshot, ownerReport: generated }} overrides={generated} />);
  const text = screen.getByLabelText('Home care advice');
  const block = within(text.closest('.owner-report__block') as HTMLElement);
  expect(text).toHaveValue(generated.generatedHomecare);
  expect(block.getByRole('button', { name: 'Refine' })).toBeDisabled();
  expect(block.getByRole('button', { name: 'Restore generated' })).toBeDisabled();
  const edited = { ...generated, homecare: 'Feed the recorded diet for 3 days.' };
  rerender(<OwnerReportSection {...props} snapshot={{ ...snapshot, ownerReport: edited }} overrides={edited} />);
  expect(block.getByText('Refine').closest('summary')).toBeInTheDocument();
  fireEvent.click(block.getByRole('button', { name: 'Restore generated' }));
  expect(onOverrideChange).toHaveBeenCalledWith('homecare', null);
  expect(buildOwnerReportModel({ ...snapshot, ownerReport: generated }).homecareTips).toEqual([generated.generatedHomecare]);
});

it('shows Restore generated and explains why older wording cannot be restored', () => {
  const snapshot = sampleOwnerReportSnapshot();
  const overrides = { homecare: 'Older wording saved before drafts were tracked.' };
  const onOverrideChange = vi.fn();
  render(<OwnerReportSection snapshot={{ ...snapshot, ownerReport: overrides }} overrides={overrides}
    onOverrideChange={onOverrideChange} onPreview={vi.fn()} aiEnabled />);
  const field = screen.getByLabelText('Home care advice');
  const block = within(field.closest('.owner-report__block') as HTMLElement);
  expect(block.getByRole('button', { name: 'Restore generated' })).toBeDisabled();
  expect(block.getByText('No generated draft is saved for this section.')).toBeVisible();
  expect(field).toHaveValue(overrides.homecare);
  expect(onOverrideChange).not.toHaveBeenCalled();
});

it('offers New template even when there is only one saved template', () => {
  const onNewTemplate = vi.fn();
  const onOverrideChange = vi.fn();
  render(<OwnerReportSection snapshot={sampleOwnerReportSnapshot()} overrides={{}} onOverrideChange={onOverrideChange}
    onPreview={vi.fn()} onNewTemplate={onNewTemplate} />);
  const picker = screen.getByRole('combobox', { name: 'Report template' });
  expect(picker).toBeEnabled();
  const option = within(picker).getByRole('option', { name: 'New template' });
  fireEvent.change(picker, { target: { value: (option as HTMLOptionElement).value } });
  expect(onNewTemplate).toHaveBeenCalledOnce();
  expect(onOverrideChange).not.toHaveBeenCalled();
  expect(picker).toHaveDisplayValue('Practice default (Standard)');
});
