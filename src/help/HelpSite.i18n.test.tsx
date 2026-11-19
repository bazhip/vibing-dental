import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { LANGUAGE_NAMES } from '../i18n/config';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import { HelpSite } from './HelpSite';

beforeEach(() => {
  window.history.replaceState(null, '', '/help/');
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});

afterEach(async () => {
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await act(() => restoreLocale());
});

it('localizes the home and deep-linked article under the pseudo locale', async () => {
  await act(() => installPseudoLocale());
  const { container } = render(<HelpSite />);
  expect(findUntranslated(container, Object.values(LANGUAGE_NAMES))).toEqual([]);
  act(() => {
    window.history.replaceState(null, '', '/help/#imaging/third');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  expect(container.querySelector('article')).toBeInTheDocument();
  expect(findUntranslated(container, Object.values(LANGUAGE_NAMES))).toEqual([]);
});

it('searches guide content and opens the matching article without reloading', () => {
  render(<HelpSite />);
  const input = screen.getByRole('searchbox', { name: 'Search documentation' });
  fireEvent.change(input, { target: { value: 'dicom' } });
  const main = screen.getByRole('main');
  expect(within(main).getByRole('link', { name: 'Review images and DICOM files' })).toBeInTheDocument();
  fireEvent.click(within(main).getByRole('link', { name: 'Imaging and reports' }));
  expect(location.hash).toBe('#imaging');
  expect(within(main).getByRole('heading', { name: 'Write the imaging reports' })).toBeInTheDocument();
  expect(input).toHaveValue('');
  fireEvent.change(input, { target: { value: 'pims' } });
  expect(within(main).getByText(/No matching guides/)).toBeInTheDocument();
});

it('features numbered charting and links to the settings reference', () => {
  render(<HelpSite />);
  const main = screen.getByRole('main');
  fireEvent.click(within(main).getByRole('link', { name: /^Chart by tooth number Use the numbered diagram/ }));
  expect(location.hash).toBe('#by-number');
  expect(within(main).getByRole('img', { name: /Triadan 108/ })).toBeInTheDocument();

  fireEvent.click(within(main).getByRole('link', { name: /Customize ToothOps/ }));
  expect(location.hash).toBe('#preferences');
  expect(within(main).getByText('Imaging and PDF', { selector: 'dt' })).toBeInTheDocument();
  expect(within(main).getByRole('img', { name: /report language and default PDF/ })).toBeInTheDocument();
});
