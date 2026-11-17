import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExamAreasEditor } from './ExamAreasEditor';
import { EXAM_ITEMS } from '../types';
import { normalizeChartPrefs } from '../utils/chartSettings';

describe('exam area selection', () => {
  it('starts with built-in areas selected and additional suggestions unchecked', () => {
    render(<ExamAreasEditor areas={[]} onChange={vi.fn()} />);
    for (const { label } of EXAM_ITEMS) expect(screen.getByRole('checkbox', { name: label })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Salivary duct openings' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Gingiva / mucogingival line' })).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Lips / mucocutaneous junction' })).toBeNull();
  });

  it('labels the custom-area limit separately from the three suggestions', () => {
    render(<ExamAreasEditor areas={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Custom areas added: 0 · Limit: 8')).toBeInTheDocument();
    expect(screen.queryByText('0 of 8 configured')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add area' }));
    expect(screen.getByText('Custom areas added: 0 · Limit: 8')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Exam area 1 name' }), { target: { value: 'My area' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Exam area 1 name' }));
    expect(screen.getByText('Custom areas added: 1 · Limit: 8')).toBeInTheDocument();
  });

  it('changes only visibility for an existing area', () => {
    const onChange = vi.fn();
    const onHiddenChange = vi.fn();
    render(<ExamAreasEditor areas={[{ id: 'custom', label: 'My area' }]} onChange={onChange} onHiddenChange={onHiddenChange} hiddenAreas={['tongue']} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Extraoral / facial' }));
    expect(onHiddenChange).toHaveBeenLastCalledWith(['tongue', 'extraoral']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show My area' }));
    expect(onHiddenChange).toHaveBeenLastCalledWith(['tongue', 'custom']);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds suggestions individually without duplicating existing suggestions', () => {
    const onChange = vi.fn();
    render(<ExamAreasEditor areas={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Salivary duct openings' }));
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'preset-salivary', label: 'Salivary duct openings' }]);
    expect(screen.queryByRole('checkbox', { name: 'Salivary duct openings' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Show Salivary duct openings' })).toBeChecked();
  });

  it('normalizes saved visibility preferences without losing custom IDs', () => {
    expect(normalizeChartPrefs({ hiddenExamAreas: ['tongue', 'custom', 'tongue', null, '', 'a'.repeat(41)] }).hiddenExamAreas).toEqual(['tongue', 'custom']);
    expect(normalizeChartPrefs({}).hiddenExamAreas).toEqual([]);
  });
});
