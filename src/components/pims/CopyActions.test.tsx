import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import type { RecordNote } from '../../utils/recordNote';
import { copyRichText } from '../../utils/clipboard';
import { copyChartImage } from '../../utils/pims/clipboard';
import { CopyActions } from './CopyActions';

vi.mock('../../utils/clipboard', () => ({ copyRichText: vi.fn(async () => 'rich') }));
vi.mock('../../utils/pims/clipboard', async (original) => ({
  ...await original<typeof import('../../utils/pims/clipboard')>(),
  copyChartImage: vi.fn(async () => 'copied'),
}));

const note: RecordNote = { sections: [
  { key: 'exam', heading: 'Exam', lines: ['Healthy <gums>.'] },
  { key: 'treatment', heading: 'Treatment', lines: ['Scale & polish.'] },
] };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(copyRichText).mockResolvedValue('rich'); });
afterEach(cleanup);

describe('manual PIMS transfer', () => {
  it('copies all text with escaped HTML and reports paste instructions, not a PIMS send', async () => {
    render(<CopyActions note={note} storedText={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
    await waitFor(() => expect(copyRichText).toHaveBeenCalledWith(
      expect.stringContaining('Healthy &lt;gums&gt;.'),
      'EXAM\nHealthy <gums>.\n\nTREATMENT\nScale & polish.', expect.any(String),
    ));
    expect(await screen.findByRole('status')).toHaveTextContent('Copied');
    expect(screen.getByRole('status')).toHaveTextContent('Paste');
    expect(screen.queryByText(/Sent to PIMS/)).not.toBeInTheDocument();
  });

  it('copies a single section without the other sections', async () => {
    render(<CopyActions note={note} storedText={null} />);
    fireEvent.click(screen.getByText('Copy individual sections'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy Exam' }));
    await waitFor(() => expect(copyRichText).toHaveBeenCalledWith(
      '<p><strong>Exam</strong><br>Healthy &lt;gums&gt;.</p>', 'EXAM\nHealthy <gums>.', expect.any(String),
    ));
  });

  it('preserves unsplittable edits and hides generated section actions', async () => {
    render(<CopyActions note={note} storedText="My changed note" />);
    expect(screen.queryByRole('button', { name: 'Copy Exam' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
    await waitFor(() => expect(copyRichText).toHaveBeenCalledWith('<p>My changed note</p>', 'My changed note', expect.any(String)));
  });

  it('does not regenerate a deliberately empty note or offer an unavailable picture', () => {
    render(<CopyActions note={note} storedText="" />);
    expect(screen.getByRole('button', { name: 'Copy all' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Copy Exam' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy chart picture' })).not.toBeInTheDocument();
  });

  it.each(['plain', 'prompt'] as const)('distinguishes the %s fallback from a rich copy', async (outcome) => {
    vi.mocked(copyRichText).mockResolvedValue(outcome);
    render(<CopyActions note={note} storedText={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(outcome === 'plain' ? 'plain text' : 'copy dialog');
    if (outcome === 'prompt') expect(status).not.toHaveTextContent('Copied');
  });

  it('reports clipboard exceptions without claiming success', async () => {
    vi.mocked(copyRichText).mockRejectedValue(new TypeError());
    render(<CopyActions note={note} storedText={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t');
    expect(screen.getByRole('button', { name: 'Copy all' })).toBeEnabled();
  });

  it.each(['copied', 'unavailable', 'failed'] as const)('handles a picture result of %s', async (outcome) => {
    vi.mocked(copyChartImage).mockResolvedValue(outcome);
    const renderImage = vi.fn(async () => null);
    render(<CopyActions note={note} storedText={null} renderImage={renderImage} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy chart picture' }));
    await waitFor(() => expect(copyChartImage).toHaveBeenCalledWith(renderImage));
    const feedback = await screen.findByRole(outcome === 'copied' ? 'status' : 'alert');
    expect(feedback).toHaveTextContent(outcome === 'copied' ? 'Copied' : outcome === 'unavailable' ? 'browser' : 'couldn’t');
    expect(copyRichText).not.toHaveBeenCalled();
  });

  it('serializes copy actions and removes success when note content changes', async () => {
    let finish!: (value: 'rich') => void;
    vi.mocked(copyRichText).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(<CopyActions note={note} storedText={null} />);
    fireEvent.click(screen.getByText('Copy individual sections'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy Exam' }));
    expect(copyRichText).toHaveBeenCalledTimes(1);
    await act(async () => { finish('rich'); });
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
    view.rerender(<CopyActions note={note} storedText="Updated note" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('ignores a completed copy for a replaced note', async () => {
    let finish!: (value: 'rich') => void;
    vi.mocked(copyRichText).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(<CopyActions note={note} storedText={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
    view.rerender(<CopyActions note={note} storedText="Another patient" />);
    await act(async () => { finish('rich'); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('disables all copy actions during an automatic send', () => {
    render(<CopyActions note={note} storedText={null} renderImage={async () => null} disabled />);
    fireEvent.click(screen.getByText('Copy individual sections'));
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
  });
});
