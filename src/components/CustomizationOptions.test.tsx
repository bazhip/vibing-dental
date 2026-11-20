import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuickCodesEditor } from './QuickCodesEditor';
import { ExamAreasEditor } from './ExamAreasEditor';
import { MAX_QUICK_CODES } from '../utils/quickCodes';
import { MAX_CUSTOM_EXAM_AREAS } from '../utils/customExam';

describe('customization list management', () => {
  it('reorders quick codes from the keyboard and ignores boundary moves', () => {
    const onChange = vi.fn();
    render(<QuickCodesEditor codes={['T/SN', 'T/SR']} onChange={onChange} />);
    const first = screen.getByRole('button', { name: 'Reorder T/SN' });
    const last = screen.getByRole('button', { name: 'Reorder T/SR' });
    fireEvent.keyDown(first, { key: 'ArrowUp' });
    fireEvent.keyDown(last, { key: 'ArrowDown' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(last, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(['T/SR', 'T/SN']);
  });

  it('moves a quick code across multiple rows with a single pointer drag', () => {
    const onChange = vi.fn();
    render(<QuickCodesEditor codes={['T/SN', 'T/SR', 'T/F'] } onChange={onChange} />);
    const start = screen.getByRole('button', { name: 'Reorder T/SN' });
    const destination = screen.getByRole('button', { name: 'Reorder T/F' });
    start.setPointerCapture = vi.fn();
    const original = document.elementFromPoint;
    document.elementFromPoint = vi.fn(() => destination);
    try {
      fireEvent.pointerDown(start, { pointerId: 1, button: 0, clientY: 8 });
      fireEvent.pointerMove(start, { pointerId: 1, clientY: 80 });
      expect(destination.closest('[data-quick-code-row]')).toHaveAttribute('data-reorder-drop', 'after');
      fireEvent.pointerUp(start, { pointerId: 1, clientY: 80 });
      expect(onChange).toHaveBeenCalledWith(['T/SR', 'T/F', 'T/SN']);
    } finally {
      document.elementFromPoint = original;
    }
  });

  it('explains duplicates without clearing the typed code or saving', () => {
    const onChange = vi.fn();
    render(<QuickCodesEditor codes={['T/SN']} onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Code to add' });
    fireEvent.change(input, { target: { value: 't/sn' } });
    expect(screen.getByText('This code is already in your shortcuts.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue('t/sn');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('explains the quick-code limit', () => {
    render(<QuickCodesEditor codes={Array.from({ length: MAX_QUICK_CODES }, (_, i) => `C${i}`)} onChange={vi.fn()} />);
    expect(screen.getByText('Limit reached. Remove an item to add another.')).toBeInTheDocument();
  });

  it('reorders custom exam areas without changing IDs or losing a draft label', () => {
    const onChange = vi.fn();
    render(<ExamAreasEditor areas={[{ id: 'a', label: 'Lips' }, { id: 'b', label: 'Gingiva' }]} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Exam area 2 name' }), { target: { value: 'Updated area' } });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Updated area' }), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'b', label: 'Updated area' }, { id: 'a', label: 'Lips' }]);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Updated area' }), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('explains the exam area limit', () => {
    render(<ExamAreasEditor areas={Array.from({ length: MAX_CUSTOM_EXAM_AREAS }, (_, i) => ({ id: `${i}`, label: `Area ${i}` }))} onChange={vi.fn()} />);
    expect(screen.getByText('Limit reached. Remove an item to add another.')).toBeInTheDocument();
  });
});
