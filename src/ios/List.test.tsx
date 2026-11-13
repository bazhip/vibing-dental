import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { List, ListRow, ListSection, SwitchRow } from './List';

describe('List', () => {
  it('renders sections with header/footer and rows', () => {
    const onClick = vi.fn();
    render(
      <List>
        <ListSection header="Practice" footer="Shown on reports.">
          <ListRow title="Name" value="Smile Dental" accessory="chevron" onClick={onClick} />
          <ListRow title="Sign out" destructive />
        </ListSection>
      </List>
    );
    expect(screen.getByText('Practice')).toBeInTheDocument();
    expect(screen.getByText('Shown on reports.')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByText('Sign out').closest('.ios-row')).toHaveClass('ios-row--destructive');
  });

  it('a check accessory marks the row selected', () => {
    render(<List><ListSection><ListRow title="Compact" accessory="check" onClick={() => {}} /></ListSection></List>);
    expect(screen.getByRole('button', { name: /Compact/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('SwitchRow is a labelled switch', () => {
    const onChange = vi.fn();
    render(<List><ListSection><SwitchRow title="Face ID" checked={false} onChange={onChange} /></ListSection></List>);
    const sw = screen.getByRole('switch', { name: 'Face ID' });
    expect(sw).not.toBeChecked();
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('a disabled SwitchRow does not change', () => {
    const onChange = vi.fn();
    render(<List><ListSection><SwitchRow title="Face ID" checked onChange={onChange} disabled /></ListSection></List>);
    expect(screen.getByRole('switch', { name: 'Face ID' })).toBeDisabled();
  });
});
