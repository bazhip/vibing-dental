import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const flags = vi.hoisted(() => ({ native: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => flags.native, WEB_ORIGIN: 'https://toothops.app/' }));

import { PdfPreviewModal } from './PdfPreviewModal';

beforeEach(() => { flags.native = false; });

describe('PdfPreviewModal (bare, inside Documents)', () => {
  it('website: Download PDF button and the style list as before', () => {
    render(<PdfPreviewModal open bare onClose={() => {}} snapshot={null} />);
    expect(screen.getByRole('button', { name: 'Download PDF' })).toHaveClass('pdf-preview-download');
  });

  it('app: a Share PDF button with an icon, and the style list behind a picker button', () => {
    flags.native = true;
    render(<PdfPreviewModal open bare onClose={() => {}} snapshot={null} />);
    const share = screen.getByRole('button', { name: 'Share PDF' });
    expect(share.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByRole('button', { name: /Clinic Teal|Teal/ })).toHaveAttribute('aria-haspopup', 'dialog');
  });
});
