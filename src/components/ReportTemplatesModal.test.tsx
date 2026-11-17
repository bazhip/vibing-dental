import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportTemplatesModal } from './ReportTemplatesModal';

const store = { enabled: true, loaded: true, templates: [], create: vi.fn(), update: vi.fn(), remove: vi.fn() };

describe('ReportTemplatesModal keyboard access', () => {
  it('contains Tab navigation and restores the opener after closing', () => {
    const visible = vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockReturnValue(document.body);
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { rerender } = render(<ReportTemplatesModal open onClose={vi.fn()} store={store} />);
    const close = screen.getAllByRole('button', { name: 'Close' })[0];
    const buttons = screen.getAllByRole('button');
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    rerender(<ReportTemplatesModal open={false} onClose={vi.fn()} store={store} />);
    expect(opener).toHaveFocus();
    opener.remove();
    visible.mockRestore();
  });
});
