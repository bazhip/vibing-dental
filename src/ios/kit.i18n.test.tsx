// Pseudo-locale coverage for the iOS component kit: every string the kit
// draws itself (Cancel, Done, Close, Back, "More actions") comes from the
// catalog, and label props pass caller text through untouched.
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import i18n from '../i18n';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';

vi.mock('../native/platform', () => ({ isNativeApp: () => true, WEB_ORIGIN: 'https://toothops.app/' }));
vi.mock('../native/haptics', () => ({ hapticSelection: vi.fn(), hapticTap: vi.fn(), hapticImpact: vi.fn(), hapticSuccess: vi.fn() }));

import { Sheet } from './Sheet';
import { NavBar } from './NavBar';
import { TabBar } from './TabBar';
import { List, ListRow, ListSection, SwitchRow } from './List';
import { FormField, FormGroup, Segmented } from './Form';
import { SearchField } from './SearchField';
import { Stack, useStack } from './Stack';
import { SwipeRow } from './SwipeRow';
import { ContextMenu, MenuPopover } from './ContextMenu';
import { Icon } from './icons';

const t = i18n.getFixedT(null, 'common');

beforeAll(async () => {
  window.ResizeObserver = window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
  await installPseudoLocale();
});
afterAll(restoreLocale);
afterEach(cleanup);

test('Sheet: its default Cancel / Done and the close button are translated', () => {
  render(
    <>
      <Sheet open onClose={() => {}} title={t('ios.settings.chart')} onDone={() => {}}>
        <p>{t('actions.save')}</p>
      </Sheet>
      <Sheet open onClose={() => {}} title={t('ios.tabs.patients')}>
        <p>{t('actions.done')}</p>
      </Sheet>
    </>,
  );
  expect(findUntranslated(document.body)).toEqual([]);
});

function PushButton() {
  const { push } = useStack();
  return (
    <button type="button" onClick={() => push({ id: 'next', title: t('ios.tabs.rechecks'), render: () => <p>{t('actions.save')}</p> })}>
      {t('actions.edit')}
    </button>
  );
}

test('Stack: the Back button names the previous screen, else says Back', async () => {
  render(<Stack root={<PushButton />} />);
  await act(async () => { fireEvent.click(screen.getByText('⟦Edit⟧')); });
  expect(findUntranslated(document.body)).toEqual([]);
});

test('NavBar, TabBar, lists, forms and the search field show only caller text', () => {
  render(
    <>
      <NavBar title={t('ios.tabs.patients')} subtitle={t('ios.tabs.rechecks')} largeTitle />
      <TabBar
        label={t('ios.shell.appName')}
        active="chart"
        onChange={() => {}}
        tabs={[
          { id: 'chart', label: t('ios.tabs.chart'), icon: 'doc-text' },
          { id: 'settings', label: t('ios.tabs.settings'), icon: 'gear', badge: 2 },
        ]}
      />
      <List>
        <ListSection header={t('ios.tabs.settings')} footer={t('ios.settings.chart')}>
          <ListRow title={t('ios.tabs.chart')} subtitle={t('ios.tabs.patients')} value={t('actions.save')} accessory="chevron" onClick={() => {}} />
          <SwitchRow title={t('actions.edit')} checked onChange={() => {}} />
        </ListSection>
      </List>
      <FormGroup header={t('ios.tabs.patients')} footer={t('ios.tabs.rechecks')}>
        <FormField label={t('actions.save')}>
          <input />
        </FormField>
        <FormField as="div" label={t('actions.edit')}>
          <Segmented
            label={t('actions.done')}
            options={[{ value: 'a', label: t('actions.cancel') }, { value: 'b', label: t('actions.close') }]}
            value="a"
            onChange={() => {}}
          />
        </FormField>
      </FormGroup>
      <SearchField value="" onChange={() => {}} placeholder={t('ios.tabs.patients')} label={t('ios.tabs.patients')} clearLabel={t('actions.close')} />
      <Icon name="gear" title={t('ios.tabs.settings')} />
    </>,
  );
  expect(findUntranslated(document.body)).toEqual([]);
});

test('SwipeRow and the context menus: the "More actions" button is translated', () => {
  render(
    <List>
      <ListSection>
        <SwipeRow actions={[{ label: t('actions.delete'), tone: 'destructive', onAction: () => {} }]} label={t('ios.tabs.chart')}>
          <ListRow title={t('ios.tabs.chart')} />
        </SwipeRow>
        <ContextMenu items={[{ label: t('actions.edit'), onSelect: () => {} }]}>
          <ListRow title={t('ios.tabs.rechecks')} />
        </ContextMenu>
      </ListSection>
    </List>,
  );
  render(
    <MenuPopover
      label={t('ios.tabs.settings')}
      anchor={{ left: 10, top: 10, width: 20, height: 20 }}
      items={[{ label: t('actions.edit'), section: t('ios.tabs.chart'), onSelect: () => {} }, { label: t('actions.delete'), destructive: true, onSelect: () => {} }]}
      onClose={() => {}}
    />,
  );
  expect(findUntranslated(document.body)).toEqual([]);
});
