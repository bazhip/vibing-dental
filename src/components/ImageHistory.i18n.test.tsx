import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import type { Attachment } from '../hooks/useAttachments';
import { ImageHistory, groupByVisit } from './ImageHistory';

const listAttachmentsForCharts = vi.fn();
vi.mock('../hooks/useAttachments', () => ({
  listAttachmentsForCharts: (...a: unknown[]) => listAttachmentsForCharts(...a),
}));

beforeEach(installPseudoLocale);
afterEach(async () => {
  cleanup();
  listAttachmentsForCharts.mockReset();
  await restoreLocale();
});

const img = (id: string, chartId: string, extra: Partial<Attachment> = {}): Attachment => ({
  id, chartId, path: `${id}.jpg`, caption: '', kind: 'xray', toothTriadan: null, createdAt: '',
  url: `https://x/${id}.jpg`, thumbUrl: '', originalPath: null, originalUrl: '', ...extra,
});
const visits = [
  { id: 'v-old', date: '2025-03-01' },
  { id: 'v-new', date: '2026-06-15' },
  { id: 'v-none', date: '2026-01-10' },
];
const ALLOW = [/Pre-op/, /^\d+$/];

test('groupByVisit: newest visit first, visits without images left out', () => {
  const groups = groupByVisit(visits, [img('a', 'v-old'), img('b', 'v-new'), img('c', 'v-new')]);
  expect(groups.map((g) => [g.visit.id, g.items.map((i) => i.id)])).toEqual([
    ['v-new', ['b', 'c']],
    ['v-old', ['a']],
  ]);
});

test('hidden by default; nothing loads until it is opened', async () => {
  listAttachmentsForCharts.mockResolvedValue([img('a', 'v-old', { caption: 'Pre-op', toothTriadan: 108 }), img('b', 'v-new', { kind: 'photo' })]);
  const onOpenVisit = vi.fn();
  const { container } = render(<ImageHistory visits={visits} onOpenVisit={onOpenVisit} />);
  const toggle = screen.getByRole('button', { name: '⟦Image history (3 other visits)⟧' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(listAttachmentsForCharts).not.toHaveBeenCalled();
  expect(container.querySelector('img')).toBeNull();
  expect(findUntranslated(container, ALLOW)).toEqual([]);

  fireEvent.click(toggle);
  await waitFor(() => expect(container.querySelectorAll('.image-history__visit')).toHaveLength(2));
  expect(listAttachmentsForCharts).toHaveBeenCalledWith(['v-old', 'v-new', 'v-none']);
  const dates = Array.from(container.querySelectorAll('.image-history__date')).map((h) => h.textContent);
  expect(dates[0]).toMatch(/2026/);
  expect(dates[1]).toMatch(/2025/);
  expect(findUntranslated(container, ALLOW)).toEqual([]);

  fireEvent.click(screen.getAllByRole('button', { name: '⟦Open visit⟧' })[1]);
  expect(onOpenVisit).toHaveBeenCalledWith('v-old');
});

test('opens the viewer across visits, with the visit date', async () => {
  listAttachmentsForCharts.mockResolvedValue([img('a', 'v-old'), img('b', 'v-new')]);
  const { container } = render(<ImageHistory visits={visits} />);
  fireEvent.click(screen.getByRole('button', { name: /Image history/ }));
  await waitFor(() => expect(container.querySelectorAll('.image-history__thumb-btn')).toHaveLength(2));
  fireEvent.click(container.querySelectorAll('.image-history__thumb-btn')[1]);
  const dialog = screen.getByRole('dialog');
  expect(dialog.textContent).toContain('2025');
  expect(findUntranslated(container, ALLOW)).toEqual([]);
});

test('empty and failed states, with retry', async () => {
  listAttachmentsForCharts.mockResolvedValueOnce(null).mockResolvedValueOnce([]);
  const { container } = render(<ImageHistory visits={visits} />);
  fireEvent.click(screen.getByRole('button', { name: /Image history/ }));
  await screen.findByRole('alert');
  expect(findUntranslated(container, ALLOW)).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: '⟦Try again⟧' }));
  await screen.findByText('⟦No images from this patient’s other visits.⟧');
  expect(findUntranslated(container, ALLOW)).toEqual([]);
});

test('renders nothing when the patient has no other visits', () => {
  const { container } = render(<ImageHistory visits={[]} />);
  expect(container.firstChild).toBeNull();
});
