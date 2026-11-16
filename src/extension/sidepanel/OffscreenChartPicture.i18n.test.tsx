import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../../i18n/testing/pseudo';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS, type ChartSnapshot } from '../../types';
import { useOffscreenChartPicture } from './OffscreenChartPicture';

beforeAll(() => {
  window.ResizeObserver = window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(async () => { await installPseudoLocale(); });
afterEach(async () => { cleanup(); await restoreLocale(); });

const snapshot = {
  patientInfo: {
    patientName: 'Bella', patientNumber: '1', doctor: '', tech: '', date: '2026-11-11', complaint: '',
    treatmentReport: '', recallDate: '', nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
  },
  toothData: [], species: 'canine', logo: 'socal',
  preMarks: {}, preComments: [], preStrokes: [], postMarks: {}, postComments: [], postStrokes: [],
} as unknown as ChartSnapshot;

const Probe = () => useOffscreenChartPicture(snapshot).element;

describe('off-screen chart picture (pseudo-locale)', () => {
  it('has no untranslated text', () => {
    render(<Probe />);
    expect(findUntranslated(document.body)).toEqual([]);
  });
});
