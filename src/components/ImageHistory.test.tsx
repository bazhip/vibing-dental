import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import type { Attachment } from '../hooks/useAttachments';
import { ImageHistory } from './ImageHistory';

const load = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useAttachments', () => ({ listAttachmentsForCharts: load }));
const attachment = (id: string, chartId: string): Attachment => ({
  id, chartId, path: `${id}.jpg`, caption: id, kind: 'photo', toothTriadan: null,
  createdAt: '2026-01-01', url: `https://test.invalid/${id}.jpg`, thumbUrl: '', originalPath: null, originalUrl: '',
});
beforeEach(() => load.mockReset());

it('hides history for visits with no images and does not fetch without visits', async () => {
  load.mockResolvedValue([]);
  const { container, rerender } = render(<ImageHistory visits={[]} />);
  expect(load).not.toHaveBeenCalled();
  rerender(<ImageHistory visits={[{ id: 'a', date: '2026-01-01' }]} />);
  await waitFor(() => expect(load).toHaveBeenCalledWith(['a']));
  expect(container.firstChild).toBeNull();
});

it('clears previous patient thumbnails immediately and ignores a stale response', async () => {
  let resolveOld!: (items: Attachment[]) => void;
  load.mockImplementationOnce(() => new Promise<Attachment[]>((resolve) => { resolveOld = resolve; }));
  load.mockResolvedValueOnce([attachment('new-patient-image', 'new')]);
  const { rerender } = render(<ImageHistory visits={[{ id: 'old', date: '2025-01-01' }]} />);
  rerender(<ImageHistory visits={[{ id: 'new', date: '2026-01-01' }]} />);
  await screen.findByRole('img', { name: 'new-patient-image' });
  await act(async () => resolveOld([attachment('old-patient-image', 'old')]));
  expect(screen.queryByRole('img', { name: 'old-patient-image' })).toBeNull();
  expect(screen.getByRole('img', { name: 'new-patient-image' })).toBeInTheDocument();

  load.mockImplementationOnce(() => new Promise(() => {}));
  rerender(<ImageHistory visits={[{ id: 'third', date: '2026-02-01' }]} />);
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Image history' })).toBeNull();
});

it('keeps earlier images in a single strip until expanded', async () => {
  load.mockResolvedValue([attachment('first', 'a'), attachment('second', 'b')]);
  render(<ImageHistory visits={[{ id: 'a', date: '2026-01-01' }, { id: 'b', date: '2026-02-01' }]} />);
  const toggle = await screen.findByRole('button', { name: 'Expand image history' });
  const body = document.getElementById(toggle.getAttribute('aria-controls')!);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(body).toHaveClass('image-history__body--strip');
  fireEvent.click(toggle);
  expect(toggle).toHaveAccessibleName('Collapse image history');
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(body).not.toHaveClass('image-history__body--strip');
  fireEvent.click(toggle);
  expect(body).toHaveClass('image-history__body--strip');
});
