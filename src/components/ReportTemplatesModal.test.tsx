import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
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


describe('ReportTemplatesModal leave guard', () => {
  it('blocks workspace navigation and unload during saving, then unregisters on unmount', async () => {
    let finish: (value: { id: string; name: string; body: string }) => void;
    const create = vi.fn(() => new Promise<{ id: string; name: string; body: string }>((resolve) => { finish = resolve; }));
    let guard: (() => Promise<boolean>) | null = null;
    const register = vi.fn((next: (() => Promise<boolean>) | null) => { guard = next; });
    const { unmount } = render(<ReportTemplatesModal open onClose={vi.fn()} store={{ ...store, create }} onLeaveGuardChange={register} />);
    expect(await guard!()).toBe(true);
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Extraction' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    expect(await guard!()).toBe(false);
    const unloading = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unloading);
    expect(unloading.defaultPrevented).toBe(true);
    await act(async () => { finish!({ id: 'new', name: 'Extraction', body: '' }); });
    expect(await guard!()).toBe(true);
    unmount();
    expect(register).toHaveBeenLastCalledWith(null);
  });
});
