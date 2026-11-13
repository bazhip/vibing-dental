import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

let native = false;
vi.mock('../native/platform', () => ({ isNativeApp: () => native }));
vi.mock('../native/camera', () => ({ takePhoto: vi.fn() }));

const store = {
  items: [] as unknown[],
  loaded: true,
  maxImages: 2,
  dicomEnabled: false,
  upload: vi.fn(),
  remove: vi.fn(),
  updateCaption: vi.fn(),
};
vi.mock('../hooks/useAttachments', () => ({ useAttachments: () => store }));

import { ImagingSection } from './ImagingSection';

const renderIt = () => render(<ImagingSection chartId="c1" cloudActive />);

describe('ImagingSection camera button', () => {
  beforeEach(() => {
    native = false;
    store.items = [];
  });

  it('is hidden on web', () => {
    renderIt();
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull();
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
    expect(screen.getByRole('button', { name: 'Add image' })).toHaveAttribute('title', 'This chart has reached its 2-image limit.');
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
