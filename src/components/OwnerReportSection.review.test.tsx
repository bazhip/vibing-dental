import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi } from 'vitest';
import { OwnerReportSection } from './OwnerReportSection';
import { buildOwnerReportModel } from '../utils/ownerReport';
import { sampleOwnerReportSnapshot } from '../utils/ownerReportSample';
import { defaultConfig, defaultTemplate } from '../utils/ownerReportConfig';

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

it('shows the practice template and places management beside the template choices', () => {
  const preview = vi.fn();
  const manage = vi.fn();
  render(<OwnerReportSection snapshot={sampleOwnerReportSnapshot()} overrides={{}} onOverrideChange={vi.fn()}
    onPreview={preview} onCustomize={manage} />);
  const choices = within(screen.getByRole('group', { name: 'Report template' }));
  expect(choices.getByText('Practice default (Standard)')).toBeVisible();
  fireEvent.click(choices.getByRole('button', { name: 'Manage templates' }));
  expect(manage).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Preview owner report' }));
  expect(preview).toHaveBeenCalledOnce();
});

it('keeps report edits when the active template is selected again', () => {
  const config = defaultConfig();
  config.templates.push({ ...defaultTemplate(), id: 'second', name: 'Follow-up' });
  const onOverrideChange = vi.fn();
  const overrides = { templateId: 'second', intro: 'Saved report wording.' };
  const snapshot = { ...sampleOwnerReportSnapshot(), ownerReport: overrides };
  render(<OwnerReportSection snapshot={snapshot} overrides={overrides} onOverrideChange={onOverrideChange}
    onPreview={vi.fn()} context={{ config }} />);
  const active = screen.getByRole('button', { name: 'Follow-up', pressed: true });
  fireEvent.click(active);
  expect(onOverrideChange).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Opening summary' })).toHaveValue(overrides.intro);
  fireEvent.click(screen.getByRole('button', { name: 'Practice default (Standard)', pressed: false }));
  expect(onOverrideChange).toHaveBeenCalledWith('templateId', null);
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

it('keeps template creation inside management and places the guide in the picker heading', () => {
  const onCustomize = vi.fn();
  render(<OwnerReportSection snapshot={sampleOwnerReportSnapshot()} overrides={{}} onOverrideChange={vi.fn()}
    onPreview={vi.fn()} onCustomize={onCustomize} aiEnabled />);
  const picker = within(screen.getByRole('group', { name: 'Report template' }));
  const manage = picker.getByRole('button', { name: 'Manage templates' });
  const guide = picker.getByRole('link', { name: 'How templates work' });
  expect(guide.closest('.template-picker__heading')).toContainElement(guide);
  expect(guide).toHaveTextContent('?');
  expect(picker.queryByRole('button', { name: 'New template' })).toBeNull();
  expect(picker.queryByRole('button', { name: 'Write with AI' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Write with AI' })).toBeVisible();
  fireEvent.click(manage);
  expect(onCustomize).toHaveBeenCalledOnce();
});
