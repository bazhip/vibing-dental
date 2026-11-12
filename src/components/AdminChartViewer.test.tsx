import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { AdminChartViewer, chartedTeeth } from './AdminChartViewer';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from '../types';

beforeAll(() => {
  window.ResizeObserver = window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
});

const snapshot = {
  patientInfo: {
    patientName: 'Bella', patientNumber: '4411', ownerName: 'Sam Lee', ownerPhone: '', ownerEmail: '',
    doctor: 'Dr Dyson', tech: '', date: '2026-11-11', complaint: 'Bad breath', treatmentReport: 'Full mouth scale and polish.',
    recallDate: '',
    nerveBlocks: { ...EMPTY_NERVE_BLOCKS, infraorbitalRight: '0.3', drugs: [{ name: 'Bupivacaine', concentration: '0.5' }] },
    exam: { ...EMPTY_EXAM_FINDINGS, tongue: { status: 'normal', comment: '' } },
  },
  toothData: [
    { tooth: '102', triadan: 102, gingivitis: '1', mobility: '2' },
    { tooth: '101', triadan: 101, gingivitis: '2' },
    { tooth: '103', triadan: 103 },
  ],
  species: 'canine', logo: 'socal',
  preMarks: { 103: 'missing' }, preComments: [], preStrokes: [],
  postMarks: {}, postComments: [], postStrokes: [],
};

describe('AdminChartViewer', () => {
  it('shows the chart read-only with a logged-view notice', () => {
    render(<AdminChartViewer data={snapshot} practiceName="Horizon Vets" onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: /Horizon Vets · Bella #4411 · 2026-11-11/ })).toBeInTheDocument();
    expect(screen.getByText(/This view is logged/)).toBeInTheDocument();
    expect(screen.getByText('Bad breath')).toBeInTheDocument();
    expect(screen.getByText(/0.5% Bupivacaine/)).toBeInTheDocument();
    expect(screen.getByText('0.3 mL')).toBeInTheDocument();
    expect(screen.getByText('Full mouth scale and polish.')).toBeInTheDocument();
    // No editable fields anywhere.
    expect(document.querySelectorAll('.admin-chart-viewer input, .admin-chart-viewer textarea, .admin-chart-viewer select')).toHaveLength(0);
  });

  it('lists only charted teeth, in order', () => {
    expect(chartedTeeth(snapshot.toothData as never).map((t) => t.triadan)).toEqual([101, 102]);
  });

  it('handles damaged chart data without crashing', () => {
    render(<AdminChartViewer data={{ nope: true }} practiceName="X" onClose={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/damaged/);
  });

  it('Escape closes the viewer only (not the admin panel underneath)', () => {
    const panelEscape = vi.fn();
    document.addEventListener('keydown', panelEscape);
    const onClose = vi.fn();
    render(<AdminChartViewer data={snapshot} practiceName="X" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(panelEscape).not.toHaveBeenCalled();
    document.removeEventListener('keydown', panelEscape);
  });
});
