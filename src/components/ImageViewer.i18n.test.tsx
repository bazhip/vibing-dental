import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import type { Attachment } from '../hooks/useAttachments';
import { imageToothLabel } from '../utils/imageTeeth';
import { ImageViewer, defaultWindow } from './ImageViewer';

const decodeDicomPixels = vi.fn();
vi.mock('../utils/dicom', () => ({
  decodeDicomPixels: (...a: unknown[]) => decodeDicomPixels(...a),
  windowToRgba: (_v: Float32Array, w: number, h: number) => new Uint8ClampedArray(w * h * 4),
}));

beforeEach(installPseudoLocale);
afterEach(async () => {
  cleanup();
  decodeDicomPixels.mockReset();
  vi.unstubAllGlobals();
  await restoreLocale();
});

const photo: Attachment = {
  id: 'a1', chartId: 'c', path: 'p', caption: 'Pre-op', kind: 'photo', toothTriadan: 108, createdAt: '',
  url: 'https://x/a.jpg', thumbUrl: '', originalPath: null, originalUrl: '',
};
const rad: Attachment = { ...photo, id: 'a2', caption: '', kind: 'xray', toothTriadan: null, originalPath: 'o.dcm', originalUrl: 'https://x/o.dcm' };
const ALLOW = ['Pre-op'];

const renderIt = (items: Attachment[], index = 0, onIndexChange = vi.fn(), onClose = vi.fn()) =>
  render(<ImageViewer items={items} index={index} onIndexChange={onIndexChange} onClose={onClose} toothLabel={(n) => imageToothLabel(n)} />);

test('everything on screen is translated: photo with a tooth, DICOM radiograph', () => {
  const { container, rerender } = renderIt([photo, rad]);
  expect(findUntranslated(container, ALLOW)).toEqual([]);
  expect(screen.getByText(/^108 · ⟦/)).toBeInTheDocument();
  rerender(<ImageViewer items={[photo, rad]} index={1} onIndexChange={vi.fn()} onClose={vi.fn()} />);
  expect(findUntranslated(container, ALLOW)).toEqual([]);
  expect(screen.getByRole('button', { name: '⟦Window / level⟧' })).toBeInTheDocument();
});

test('keyboard: arrows step through images, Escape closes', () => {
  const onIndexChange = vi.fn();
  const onClose = vi.fn();
  renderIt([photo, rad], 0, onIndexChange, onClose);
  const dialog = screen.getByRole('dialog');
  fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
  expect(onIndexChange).toHaveBeenLastCalledWith(1);
  fireEvent.keyDown(dialog, { key: 'ArrowRight' });
  expect(onIndexChange).toHaveBeenLastCalledWith(1);
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});

test('zoom, rotate and invert change the view; reset puts it back', () => {
  const { container } = renderIt([photo]);
  const frame = container.querySelector('.image-viewer__frame') as HTMLElement;
  fireEvent.click(screen.getByRole('button', { name: '⟦Zoom in⟧' }));
  expect(screen.getByText('⟦125%⟧')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '⟦Rotate right⟧' }));
  expect(frame.style.transform).toContain('rotate(90deg)');
  fireEvent.click(screen.getByRole('button', { name: '⟦Invert⟧' }));
  expect(frame.style.filter).toContain('invert(1)');
  fireEvent.click(screen.getByRole('button', { name: '⟦Reset⟧' }));
  expect(frame.style.transform).toContain('rotate(0deg)');
  expect(frame.style.transform).toContain('scale(1)');
  expect(frame.style.filter).not.toContain('invert');
  // No arrows with a single image.
  expect(screen.queryByRole('button', { name: '⟦Next image⟧' })).toBeNull();
});

test('window/level loads the original DICOM and shows the window controls', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(4))));
  decodeDicomPixels.mockResolvedValue({
    kind: 'gray', width: 2, height: 1, values: new Float32Array([0, 4095]), min: 0, max: 4095, invert: false,
  });
  const { container } = renderIt([rad]);
  fireEvent.click(screen.getByRole('button', { name: '⟦Window / level⟧' }));
  await screen.findByText('⟦Window⟧');
  expect(fetch).toHaveBeenCalledWith('https://x/o.dcm');
  expect(container.querySelector('canvas')).not.toBeNull();
  expect(findUntranslated(container, ALLOW)).toEqual([]);
});

test('a DICOM that fails to load says so, translated', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })));
  const { container } = renderIt([rad]);
  fireEvent.click(screen.getByRole('button', { name: '⟦Window / level⟧' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/^⟦/));
  expect(findUntranslated(container, ALLOW)).toEqual([]);
});

test('defaultWindow: the file window, else the full range', () => {
  expect(defaultWindow({ min: 0, max: 99, windowCenter: 40, windowWidth: 80 })).toEqual({ center: 40, width: 80 });
  expect(defaultWindow({ min: 0, max: 99 })).toEqual({ center: 50, width: 100 });
});
