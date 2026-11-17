import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

let native = false;
let touchDevice = false;
vi.mock('../native/platform', () => ({ isNativeApp: () => native }));
vi.mock('../native/camera', () => ({ takePhoto: vi.fn() }));
vi.mock('../ios/gesture', async (original) => ({ ...await original<typeof import('../ios/gesture')>(), useMediaQuery: () => touchDevice }));

const store = {
  items: [] as unknown[],
  loaded: true,
  maxImages: 2,
  dicomEnabled: false,
  upload: vi.fn(),
  remove: vi.fn(),
  updateCaption: vi.fn(),
  updateKind: vi.fn(async () => {}),
};
vi.mock('../hooks/useAttachments', () => ({ useAttachments: () => store }));

import { ImagingSection } from './ImagingSection';
import { takePhoto } from '../native/camera';
import { DialogHost } from './ui/dialogs';

const renderIt = () => render(<ImagingSection chartId="c1" cloudActive />);

describe('ImagingSection camera button', () => {
  beforeEach(() => {
    native = false;
    touchDevice = false;
    store.items = [];
    store.maxImages = 2;
  });

  it('is hidden on web', () => {
    renderIt();
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull();
  });

  it('opens the file picker from the plus drop zone and the choose-files action', () => {
    const { container } = renderIt();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Add images' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose files' }));
    expect(click).toHaveBeenCalledTimes(2);
    expect(input.multiple).toBe(true);
    expect(screen.queryByRole('textbox', { name: 'Image description (optional)' })).toBeNull();
  });

  it('offers the device camera on touch browsers without using the native bridge', () => {
    touchDevice = true;
    const { container } = renderIt();
    const camera = container.querySelector('input[capture="environment"]') as HTMLInputElement;
    expect(camera).toHaveAttribute('accept', 'image/*');
    const click = vi.spyOn(camera, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Take photo' }));
    expect(click).toHaveBeenCalledOnce();
    expect(takePhoto).not.toHaveBeenCalled();
    touchDevice = false;
  });

  it('uses the native camera and uploads the resulting photo', async () => {
    native = true;
    const file = new File(['photo'], 'camera.jpg', { type: 'image/jpeg' });
    vi.mocked(takePhoto).mockResolvedValueOnce(file);
    store.upload.mockClear();
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Take photo' }));
    await waitFor(() => expect(store.upload).toHaveBeenCalledWith(file, 'photo', ''));
  });

  it('shows on native and is enabled under the limit', () => {
    native = true;
    renderIt();
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeEnabled();
  });

  it('is disabled at the limit with the plain-fact message', () => {
    native = true;
    store.items = [{ id: 'a' }, { id: 'b' }].map((x) => ({ ...x, kind: 'photo', caption: '', url: '' }));
    renderIt();
    const btn = screen.getByRole('button', { name: 'Take photo' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'This chart has reached its 2-image limit.');
    expect(screen.getByRole('button', { name: 'Add images' })).toHaveAttribute('title', 'This chart has reached its 2-image limit.');
  });
});

describe('ImagingSection plan wording', () => {
  beforeEach(() => {
    native = false;
    store.items = [];
    store.maxImages = 2;
    store.dicomEnabled = false;
  });

  it('no-upload accounts: neutral fact in the app, free-plan note on the web', () => {
    store.maxImages = 0;
    native = true;
    const { unmount } = renderIt();
    expect(screen.getByText("Photo uploads aren't available on this account.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/plan/i);
    unmount();
    native = false;
    renderIt();
    expect(screen.getByText("Photo & radiograph uploads aren't included in the free plan.")).toBeInTheDocument();
  });

  it('DICOM off: formats only in the app, paid-plans note on the web', () => {
    native = true;
    const { unmount } = renderIt();
    expect(screen.getByText('PNG, JPEG or WEBP.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/plan/i);
    unmount();
    native = false;
    renderIt();
    expect(screen.getByText('PNG, JPEG or WEBP. DICOM (.dcm) uploads are included on paid plans.')).toBeInTheDocument();
  });
});

describe('ImagingSection uploads, teeth and viewer', () => {
  const img = (id: string, extra = {}) => ({
    id, chartId: 'c1', path: `${id}.jpg`, caption: '', kind: 'photo', toothTriadan: null, createdAt: '',
    url: `https://x/${id}.jpg`, thumbUrl: '', originalPath: null, originalUrl: '', ...extra,
  });
  const file = (name: string) => new File([new Uint8Array(4)], name, { type: 'image/png' });
  const s = store as typeof store & { updateTooth: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    native = false;
    store.items = [];
    store.maxImages = 3;
    store.upload = vi.fn(async () => {});
    s.updateTooth = vi.fn(async () => {});
  });

  it('uploads JPEGs as photos without asking for a type first', async () => {
    const { container } = renderIt();
    expect(screen.queryByRole('radiogroup', { name: 'Image type' })).toBeNull();
    const jpeg = new File([new Uint8Array(4)], 'radiograph.jpg', { type: 'image/jpeg' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [jpeg] } });
    await waitFor(() => expect(store.upload).toHaveBeenCalledWith(jpeg, 'photo', ''));
  });

  it('lets an uploaded JPEG be reclassified as a radiograph through the persistence callback', async () => {
    store.items = [img('jpeg-image')];
    const invalidateReview = vi.fn();
    render(<ImagingSection chartId="c1" cloudActive onReportContentChange={invalidateReview} />);
    const kind = screen.getByRole('combobox', { name: 'Image type' });
    expect(kind).toHaveValue('photo');
    fireEvent.change(kind, { target: { value: 'xray' } });
    await waitFor(() => expect(store.updateKind).toHaveBeenCalledWith('jpeg-image', 'xray'));
    expect(invalidateReview).toHaveBeenCalledOnce();
  });

  it('keeps image classification disabled and uploader absent on read-only visits', () => {
    store.items = [img('jpeg-image')];
    const { container } = render(<ImagingSection chartId="c1" cloudActive readOnly />);
    expect(screen.getByRole('combobox', { name: 'Image type' })).toBeDisabled();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it('uploads several picked files in order and refuses the ones past the limit', async () => {
    store.items = [img('a')];
    const { container } = render(<ImagingSection chartId="c1" cloudActive />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.multiple).toBe(true);
    fireEvent.change(input, { target: { files: [file('1.png'), file('2.png'), file('3.png')] } });
    await waitFor(() => expect(store.upload).toHaveBeenCalledTimes(2));
    expect((store.upload as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as File).name)).toEqual(['1.png', '2.png']);
    const failed = await screen.findByText('Limit of 3 images reached');
    expect(failed.closest('li')).toHaveTextContent('3.png');
  });

  it('keeps a failed file listed with its reason until dismissed', async () => {
    store.upload = vi.fn(async () => { throw new Error('boom'); });
    const { container } = render(<ImagingSection chartId="c1" cloudActive />);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file('x.png')] } });
    await screen.findByText('boom');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('boom')).toBeNull();
  });

  it('accepts dropped files', async () => {
    const { container } = render(<ImagingSection chartId="c1" cloudActive />);
    const root = container.querySelector('.imaging')!;
    const dataTransfer = { types: ['Files'], files: [file('drop.png')], dropEffect: '' };
    fireEvent.dragOver(root, { dataTransfer });
    expect(root).toHaveClass('imaging--dragging');
    fireEvent.drop(root, { dataTransfer });
    await waitFor(() => expect(store.upload).toHaveBeenCalledWith(expect.objectContaining({ name: 'drop.png' }), 'photo', ''));
    expect(root).not.toHaveClass('imaging--dragging');
  });

  it('accepts a pasted image only while the section is on screen', async () => {
    const { container } = render(<ImagingSection chartId="c1" cloudActive />);
    const root = container.querySelector('.imaging') as HTMLElement;
    const paste = () => {
      const e = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
      e.clipboardData = { files: [file('clip.png')] };
      document.dispatchEvent(e);
    };
    // jsdom has no layout: offsetParent is null, as for a hidden section.
    paste();
    expect(store.upload).not.toHaveBeenCalled();
    Object.defineProperty(root, 'offsetParent', { configurable: true, get: () => document.body });
    paste();
    await waitFor(() => expect(store.upload).toHaveBeenCalledTimes(1));
  });

  it('pins an image to a tooth of the chart species', () => {
    store.items = [img('a'), img('b', { toothTriadan: 409 })];
    render(<ImagingSection chartId="c1" cloudActive species="feline" />);
    const selects = screen.getAllByRole('combobox', { name: 'Tooth for this image' });
    const options = Array.from((selects[0] as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toContain('104');
    expect(options).not.toContain('105'); // cats have no first premolar up top
    fireEvent.change(selects[0], { target: { value: '104' } });
    expect(s.updateTooth).toHaveBeenCalledWith('a', 104);
    fireEvent.change(selects[1], { target: { value: '' } });
    expect(s.updateTooth).toHaveBeenCalledWith('b', null);
    expect(screen.getByText('409', { selector: '.imaging__tooth-badge' })).toBeInTheDocument();
  });

  it('opens the viewer on click; Ctrl/⌘-click keeps the new-tab link', () => {
    store.items = [img('a'), img('b')];
    const { container } = render(<ImagingSection chartId="c1" cloudActive />);
    const links = container.querySelectorAll('a.imaging__thumb-link');
    fireEvent.click(links[1], { metaKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(links[1]);
    expect(screen.getByRole('dialog')).toHaveTextContent('2 of 2');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

it('labels report destinations separately and saves the description', async () => {
  native = false; touchDevice = false;
  store.items = [{ id: 'a', chartId: 'c1', kind: 'photo', caption: '', url: '', toothTriadan: null }];
  store.updateCaption = vi.fn(async () => {});
  const pdf = vi.fn(), role = vi.fn();
  render(<ImagingSection chartId="c1" cloudActive includeInPdf onImageInPdfChange={pdf} onImageRoleChange={role} />);
  const checkbox = screen.getByRole('checkbox', { name: 'In clinical PDF' });
  expect(checkbox).toBeChecked();
  fireEvent.click(checkbox); expect(pdf).toHaveBeenCalledWith('a', false);
  expect(screen.getByRole('option', { name: 'Not in owner report' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Owner-report tag for this image' }), { target: { value: 'before' } });
  expect(role).toHaveBeenCalledWith('a', 'before');
  const description = screen.getByRole('textbox', { name: 'Description' });
  fireEvent.change(description, { target: { value: 'Fractured crown' } }); fireEvent.blur(description);
  await waitFor(() => expect(store.updateCaption).toHaveBeenCalledWith('a', 'Fractured crown'));
});
it('keeps Remove image visible and requires confirmation before deletion', async () => {
  native = false; touchDevice = false;
  store.items = [{ id: 'a', chartId: 'c1', kind: 'photo', caption: '', url: '', toothTriadan: null }];
  store.remove = vi.fn(async () => {});
  render(<><ImagingSection chartId="c1" cloudActive /><DialogHost /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
  expect(await screen.findByRole('alertdialog')).toHaveTextContent('the clinical PDF, and the owner report');
  expect(store.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(store.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete image' }));
  await waitFor(() => expect(store.remove).toHaveBeenCalledWith('a'));
});
