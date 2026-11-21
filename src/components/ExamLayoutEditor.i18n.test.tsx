import { fireEvent, render, screen, within } from '@testing-library/react';
import { findUntranslated, installPseudoLocale, restoreLocale } from '../i18n/testing/pseudo';
import { DEFAULT_EXAM_LAYOUT, type ExamLayoutField } from '../utils/examLayout';
import { ExamLayoutEditor } from './ExamLayoutEditor';

test('edits, reorders and restores the fields in a single translated Exam editor', async () => {
  await installPseudoLocale();
  const onSave = vi.fn<(fields: ExamLayoutField[]) => Promise<void>>().mockResolvedValue(undefined);
  try {
    render(<ExamLayoutEditor fields={DEFAULT_EXAM_LAYOUT} status="ready" mode="practice" canEdit
      onSave={onSave} onReload={vi.fn()} />);
    const dialog = screen.getByRole('region', { name: '⟦Customize Exam⟧' });

    const diagnostics = within(dialog).getByRole('button', { name: '⟦Diagnostics⟧' });
    const reorder = within(dialog).getByRole('button', { name: /Reorder .*Diagnostics/ });
    fireEvent.keyDown(reorder, { key: 'ArrowUp' });
    fireEvent.click(diagnostics);
    const label = within(dialog).getByRole('textbox', { name: '⟦Field name⟧' });
    fireEvent.change(label, { target: { value: 'Test results' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Remove Test results/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: '⟦Undo⟧' }));

    fireEvent.click(within(dialog).getByRole('button', { name: /Add field/ }));
    expect(findUntranslated(dialog, ['Test results'])).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: '⟦Text field⟧' }));
    expect(within(dialog).getByRole('button', { name: '⟦Save⟧' })).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('textbox', { name: '⟦Field name⟧' }), { target: { value: 'Risk assessment' } });
    expect(findUntranslated(dialog, ['Test results', 'Risk assessment'])).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: '⟦Save⟧' }));
    expect(onSave).toHaveBeenCalledWith([
      ...DEFAULT_EXAM_LAYOUT.slice(0, -2),
      { id: 'gpDiagnostics', kind: 'text', label: 'Test results' },
      DEFAULT_EXAM_LAYOUT.at(-2),
      { id: expect.stringMatching(/^exam-text-/), kind: 'text', label: 'Risk assessment' },
    ]);
  } finally {
    await restoreLocale();
  }
});

test('non-owners can review the practice layout without editing it', async () => {
  await installPseudoLocale();
  try {
    render(<ExamLayoutEditor fields={DEFAULT_EXAM_LAYOUT} status="ready" mode="practice" canEdit={false}
      onSave={vi.fn()} onReload={vi.fn()} />);
    const dialog = screen.getByRole('region', { name: '⟦Customize Exam⟧' });
    expect(within(dialog).getByText('⟦Only practice owners can edit this layout.⟧')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Add field|Save|Reorder/ })).toBeNull();
    expect(findUntranslated(dialog)).toEqual([]);
  } finally {
    await restoreLocale();
  }
});
