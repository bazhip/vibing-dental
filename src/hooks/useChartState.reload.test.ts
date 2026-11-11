import { vi } from 'vitest';
import { reloadIntoNewChart } from './useChartState';
import { shouldOpenLibraryOnArrival } from '../utils/arrival';

describe('reloadIntoNewChart', () => {
  it('leaves My charts for the new chart before reloading', () => {
    window.history.replaceState(null, '', '/#/library');
    const reload = vi.fn(() => {
      // At reload time the address must name the chart, not the library.
      expect(window.location.hash).toBe('#/chart/patient');
    });
    reloadIntoNewChart(reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('the reloaded blank chart is not sent back to My charts', () => {
    // A #/ route isn't a bare arrival, so the start-screen rule stays out.
    const bareArrival = !'#/chart/patient'.startsWith('#/');
    expect(shouldOpenLibraryOnArrival({ bareArrival, chartDate: '2026-11-11', today: '2026-11-11', patientName: '', dirty: false })).toBe(false);
  });
});
