import { cleanup, render } from '@testing-library/react';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../../i18n/testing/pseudo';
import type { MappingRow } from '../../utils/pims/rowChoice';
import { MappingRows } from './MappingRows';
import { SendResults } from './SendResults';

// ezyVet field titles come from the ezyVet page, as ezyVet shows them.
const PAGE_TEXT = ['Plan', 'Discharge Summary', 'Assessment'];

const field = (title: string, acceptsImage = false) => ({ title, kind: 'note' as const, acceptsImage });

beforeEach(async () => { await installPseudoLocale(); });
afterEach(async () => { cleanup(); await restoreLocale(); });

describe('shared Send to ezyVet components (pseudo-locale)', () => {
  it('mapping rows, including a field missing from the page', () => {
    const rows: MappingRow[] = [
      { key: 'treatment', label: 'Treatment', options: [field('Plan')], wanted: 'Plan' },
      { key: 'exam', label: 'Exam', options: [field('Plan')], wanted: 'Assessment' },
    ];
    render(<MappingRows rows={rows} disabled={false} onChoose={() => {}} />);
    expect(findUntranslated(document.body, [...PAGE_TEXT, 'Treatment', 'Exam'])).toEqual([]);
  });

  it('results with a success, failures and a stamp failure', () => {
    render(
      <SendResults
        rows={[
          { fieldTitle: 'Plan', code: null },
          { fieldTitle: 'Discharge Summary', code: 'save_not_confirmed' },
          { fieldTitle: 'Assessment', code: 'patient_changed' },
        ]}
        stampFailed
        sentOn="Nov 15, 2026"
        onCopyDiagnostic={() => {}}
      />,
    );
    expect(findUntranslated(document.body, [...PAGE_TEXT, 'Nov 15, 2026'])).toEqual([]);
  });
});
