import { initAppearance, getAppearance, setAppearance, subscribeAppearance } from './appearance';

describe('appearance preference', () => {
  let dark = false;
  let change: () => void;
  let dispose: () => void;
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    });
    delete document.documentElement.dataset.theme;
    dark = false;
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      get matches() { return dark; },
      addEventListener: (_: string, fn: () => void) => { change = fn; },
      removeEventListener: vi.fn(),
    })));
  });
  afterEach(() => { dispose?.(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('defaults to system and follows live changes', () => {
    dispose = initAppearance();
    expect(getAppearance()).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('light');
    dark = true; change();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
  it('remembers an override and ignores OS changes until System is selected', () => {
    dispose = initAppearance();
    setAppearance('dark');
    expect(localStorage.getItem('toothops-appearance')).toBe('dark');
    change();
    expect(document.documentElement.dataset.theme).toBe('dark');
    setAppearance('system');
    expect(document.documentElement.dataset.theme).toBe('light');
    setAppearance('light');
    dark = true; change();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
  it('restores a saved preference and synchronizes other tabs and cleared storage', () => {
    localStorage.setItem('toothops-appearance', 'dark');
    dispose = initAppearance();
    expect(getAppearance()).toBe('dark');
    const listener = vi.fn();
    const unsubscribe = subscribeAppearance(listener);
    window.dispatchEvent(new StorageEvent('storage', { key: 'toothops-appearance', newValue: 'light' }));
    expect(getAppearance()).toBe('light');
    expect(listener).toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(getAppearance()).toBe('system');
    unsubscribe();
  });
  it('tolerates invalid and unavailable storage', () => {
    localStorage.setItem('toothops-appearance', 'invalid');
    dispose = initAppearance();
    expect(getAppearance()).toBe('system');
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('blocked'); });
    expect(() => setAppearance('dark')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
    dispose();
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new DOMException('blocked'); });
    expect(() => { dispose = initAppearance(); }).not.toThrow();
    expect(getAppearance()).toBe('system');
  });
});
