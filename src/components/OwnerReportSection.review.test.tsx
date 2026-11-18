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
 fireEvent.click(within(label).getByRole('button',{name:'Reset to generated'}));
 expect(change).toHaveBeenLastCalledWith('extraNotes',null);
});
