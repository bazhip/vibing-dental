import React from 'react';
import { useModalFocus } from '../hooks/useModalFocus';
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
  const { baseElement: container, rerender } = renderIt([photo, rad]);
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
  const { baseElement: container } = renderIt([photo]);
  const frame = container.querySelector('.image-viewer__frame') as HTMLElement;
  fireEvent.click(screen.getByRole('button', { name: '⟦Zoom in⟧' }));
  expect(screen.getByText('⟦125%⟧')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '⟦More actions⟧' }));
  expect(findUntranslated(container, ALLOW)).toEqual([]);
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
  const { baseElement: container } = renderIt([rad]);
  fireEvent.click(screen.getByRole('button', { name: '⟦Window / level⟧' }));
  await screen.findByText('⟦Window⟧');
  expect(fetch).toHaveBeenCalledWith('https://x/o.dcm');
  expect(container.querySelector('canvas')).not.toBeNull();
  expect(findUntranslated(container, ALLOW)).toEqual([]);
});

test('a DICOM that fails to load says so, translated', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })));
  const { baseElement: container } = renderIt([rad]);
  fireEvent.click(screen.getByRole('button', { name: '⟦Window / level⟧' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/^⟦/));
  expect(findUntranslated(container, ALLOW)).toEqual([]);
});

test('defaultWindow: the file window, else the full range', () => {
  expect(defaultWindow({ min: 0, max: 99, windowCenter: 40, windowWidth: 80 })).toEqual({ center: 40, width: 80 });
  expect(defaultWindow({ min: 0, max: 99 })).toEqual({ center: 50, width: 100 });
});


test('modal locks page scrolling and restores focus when dismissed', () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const { unmount } = renderIt([photo]);
  expect(document.body.style.overflow).toBe('hidden');
  expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  unmount();
  expect(document.body.style.overflow).toBe('');
  expect(opener).toHaveFocus();
  opener.remove();
});

test('backdrop dismisses only when the press starts and ends outside the modal', () => {
  const onClose = vi.fn();
  renderIt([photo], 0, vi.fn(), onClose);
  const dialog = screen.getByRole('dialog');
  const backdrop = dialog.parentElement!;
  fireEvent.mouseDown(dialog);
  fireEvent.click(backdrop);
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.mouseDown(backdrop);
  fireEvent.click(backdrop);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('Escape closes the viewer without reaching a parent dialog', () => {
  const parentKeyDown = vi.fn();
  const onClose = vi.fn();
  render(<div onKeyDown={parentKeyDown}><ImageViewer items={[photo]} index={0} onIndexChange={vi.fn()} onClose={onClose} /></div>);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(parentKeyDown).not.toHaveBeenCalled();
});

test('empty input does not lock the page or steal focus', () => {
  renderIt([]);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.body.style.overflow).toBe('');
});

test('Tab stays in the viewer above a parent modal and closing restores its opener', () => {
  // jsdom has no layout; model visibility so the shared focus trap can list controls.
  const visible = vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
    return this.closest('[hidden]') ? null : document.body;
  });
  const parentKeyDown = vi.fn();
  function ParentModal() {
    const ref = useModalFocus<HTMLDivElement>(true);
    const [open, setOpen] = React.useState(false);
    return <div role="dialog" aria-modal="true" aria-label="Parent" ref={ref} onKeyDown={parentKeyDown}>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && <ImageViewer items={[photo, rad]} index={0} onIndexChange={vi.fn()} onClose={() => setOpen(false)} />}
    </div>;
  }
  try {
    render(<ParentModal />);
    const opener = screen.getByRole('button', { name: 'Open' });
    fireEvent.click(opener);
    const close = screen.getByRole('button', { name: '⟦Close viewer⟧' });
    const next = screen.getByRole('button', { name: '⟦Next image⟧' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(next).toHaveFocus();
    fireEvent.keyDown(next, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(opener).toHaveFocus();
    expect(parentKeyDown).not.toHaveBeenCalled();
  } finally {
    visible.mockRestore();
  }
});

test('loading DICOM keeps keyboard focus in the dialog when its control becomes disabled or disappears', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })));
  const onClose = vi.fn();
  renderIt([rad], 0, vi.fn(), onClose);
  const load = screen.getByRole('button', { name: '⟦Window / level⟧' });
  load.focus();
  fireEvent.click(load);
  expect(screen.getByRole('dialog')).toHaveFocus();
  await screen.findByRole('alert');
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});
