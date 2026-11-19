import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const flags = vi.hoisted(() => ({ native: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => flags.native, WEB_ORIGIN: 'https://toothops.app/' }));

import { PdfPreviewModal } from './PdfPreviewModal';

beforeEach(() => { flags.native = false; });

describe('PdfPreviewModal (bare, inside Documents)', () => {
  it('website: Download PDF and separate color settings', () => {
    render(<PdfPreviewModal open bare onClose={() => {}} snapshot={null} />);
    expect(screen.getByRole('button', { name: 'Download PDF' })).toHaveClass('ui-btn--primary');
    expect(screen.getByRole('combobox')).toHaveValue('clinic');
  });

  it('app: Share PDF still has an icon and uses the same color menu', () => {
    flags.native = true;
    render(<PdfPreviewModal open bare onClose={() => {}} snapshot={null} />);
    const share = screen.getByRole('button', { name: 'Share PDF' });
    expect(share.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByRole('combobox')).toHaveValue('clinic');
  });
});
