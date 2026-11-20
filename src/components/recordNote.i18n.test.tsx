import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import { RecordNotePanel } from './RecordNotePanel';
import { ConsultationNotePdfButton } from './ConsultationNotePdfButton';
import { sampleOwnerReportSnapshot } from '../utils/ownerReportSample';

beforeEach(async () => { await installPseudoLocale(); });
afterEach(async () => { cleanup(); await restoreLocale(); });

describe('Record note panel (pseudo-locale)', () => {
  it('translates the standalone download action', () => {
    const { container } = render(<ConsultationNotePdfButton text="" language="en" />);
    expect(findUntranslated(container)).toEqual([]);
  });

  it('translates every string, including the stale notice and actions', () => {
    const snapshot = sampleOwnerReportSnapshot();
    const { container } = render(
      <RecordNotePanel
        snapshot={snapshot}
        stored={{ text: 'Typed by the vet', source: 'edited', lng: 'en', basedOn: 'old' }}
        onChange={() => {}}
        readOnly
      />,
    );
    // The stored note is the vet's own text, not UI copy.
    expect(findUntranslated(container, ['Typed by the vet'])).toEqual([]);
  });
});
