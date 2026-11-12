import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../hooks/useTeam', () => ({ useTeam: () => ({ loaded: true, role: 'owner', members: [], practice: null }) }));

import { ChartLibrary } from './ChartLibrary';

const meta = (id: string, name: string, number: string, date: string) => ({
  id, patient_name: name, patient_number: number, owner_name: '', owner_phone: '', owner_email: '',
  species: 'canine', dentition: 'permanent', chart_date: date, recall_date: '', updated_at: `${date}T12:00:00Z`, created_by: 'u1',
});

function setup() {
  const onOpenHistory = vi.fn();
  const rows = [meta('a1', 'Bella', '11', '2026-11-12'), meta('b1', 'Max', '22', '2026-11-12'), meta('b2', 'Max', '22', '2026-10-01')];
  render(
    <ChartLibrary
      listCharts={async () => ({ rows, hasMore: false })}
      onOpen={vi.fn()}
      onDelete={vi.fn()}
      onNewVisit={vi.fn()}
      onOpenHistory={onOpenHistory}
      onSendReminder={vi.fn()}
      onClearRecalls={vi.fn()}
      onNewPatient={vi.fn()}
      onLoadPdf={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  return { onOpenHistory };
}

describe('My charts — History', () => {
  it('single-visit patients have a History button for that chart', async () => {
    const { onOpenHistory } = setup();
    fireEvent.click(await screen.findByTitle("Who saved Bella's chart, and when"));
    expect(onOpenHistory).toHaveBeenCalledWith('a1', expect.stringContaining('Bella'));
  });

  it('each visit of a multi-visit patient has its own History button', async () => {
    const { onOpenHistory } = setup();
    fireEvent.click(await screen.findByTitle('2 visits — expand'));
    const buttons = screen.getAllByTitle('Who saved this visit, and when');
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(onOpenHistory).toHaveBeenCalledWith('b2', expect.stringContaining('Max'));
  });
});
