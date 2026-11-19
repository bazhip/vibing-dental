import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import { findUntranslated, installPseudoLocale, restoreLocale } from '../i18n/testing/pseudo';
import { RefineTextAction } from './RefineTextAction';
import { DialogHost } from './ui/dialogs';

const draft = vi.hoisted(() => vi.fn());
vi.mock('../utils/refineClinicalText', async original => ({
  ...await original<typeof import('../utils/refineClinicalText')>(),
  refineClinicalText: draft,
}));
vi.mock('../native/aiConsent', () => ({ ensureAiConsent: async () => true }));

beforeEach(async () => { draft.mockReset(); await installPseudoLocale(); });
afterEach(async () => { cleanup(); await restoreLocale(); });

const source = '108 possible fracture';
const proposal = 'Possible fracture at 108.';
const options = () => {
  const summary = screen.getByText('⟦Refine⟧');
  fireEvent.click(summary);
  expect(screen.getByRole('button', { name: '⟦Make concise⟧' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '⟦Organize⟧' }));
};

it('presents the original and proposed text in the app language before applying', async () => {
  draft.mockResolvedValueOnce(proposal);
  const apply = vi.fn();
  render(<><RefineTextAction enabled value={source} onApply={apply} /><DialogHost /></>);
  options();
  const review = await screen.findByRole('alertdialog', { name: '⟦Review refinement⟧' });
  expect(within(review).getByText(source)).toBeInTheDocument();
  expect(within(review).getByText(proposal)).toBeInTheDocument();
  expect(findUntranslated(document.body, [source, proposal, '✨', '⌄'])).toEqual([]);
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(within(review).getByRole('button', { name: '⟦Apply refinement⟧' }));
  await waitFor(() => expect(apply).toHaveBeenCalledWith(proposal));
});

it('ignores a pending request if the field changes', async () => {
  let resolve!: (text: string) => void;
  draft.mockImplementationOnce(() => new Promise<string>(done => { resolve = done; }));
  const apply = vi.fn();
  const view = render(<><RefineTextAction enabled value={source} onApply={apply} /><DialogHost /></>);
  options();
  await waitFor(() => expect(draft).toHaveBeenCalled());
  view.rerender(<><RefineTextAction enabled value="Changed text" onApply={apply} /><DialogHost /></>);
  await act(async () => resolve(proposal));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(apply).not.toHaveBeenCalled();
});

it('keeps the Refine control visible on empty editable fields', () => {
  render(<RefineTextAction value="" enabled onApply={vi.fn()} />);
  expect(screen.getByRole('button', { name: '⟦Refine⟧' })).toBeDisabled();
});

it('shows progress and explains when the refinement returns the same wording', async () => {
  let resolve!: (value: string) => void;
  draft.mockImplementationOnce(() => new Promise<string>(done => { resolve = done; }));
  const apply = vi.fn();
  render(<><RefineTextAction enabled value={source} onApply={apply} /><DialogHost /></>);
  options();
  expect(screen.getByRole('status')).toHaveTextContent('⟦Refining…⟧');
  await waitFor(() => expect(draft).toHaveBeenCalled());
  await act(async () => resolve(source));
  expect(screen.getByRole('status')).toHaveTextContent('⟦No changes suggested. Your text is unchanged.⟧');
  expect(apply).not.toHaveBeenCalled();
});

it('reports a rejected draft next to the field', async () => {
  draft.mockRejectedValueOnce(new Error('network unavailable'));
  const apply = vi.fn();
  render(<RefineTextAction enabled value={source} onApply={apply} />);
  options();
  expect(await screen.findByRole('alert')).toHaveTextContent('⟦Can’t reach ToothOps — check your connection and try again.⟧');
  expect(apply).not.toHaveBeenCalled();
});
