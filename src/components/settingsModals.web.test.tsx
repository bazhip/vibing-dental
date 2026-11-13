import { act, render, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { UseTeamReturn } from '../hooks/useTeam';
import type { UseProfileReturn } from '../hooks/useProfile';

// Website guard for the Settings tab work: each settings dialog that gained
// an app rendering must render exactly the same markup on the web. The
// snapshots were recorded from the dialogs before the change.

vi.mock('../native/platform', () => ({ isNativeApp: () => false, WEB_ORIGIN: 'https://toothops.app/' }));
const invoke = vi.hoisted(() => vi.fn(async () => ({ data: null, error: new Error('offline') })));
vi.mock('../utils/supabaseClient', () => ({
  supabase: { functions: { invoke }, auth: { getUser: async () => ({ data: { user: { email: 'me@vet.com' } } }) } },
  cloudEnabled: true,
}));
const team = vi.hoisted(() => ({
  current: {
    enabled: true,
    loaded: true,
    error: '',
    practice: { id: 'p1', name: 'SoCal Vet' },
    role: 'owner',
    primaryOwnerId: 'me',
    members: [
      { userId: 'me', email: 'me@vet.com', doctorName: 'Dr Me', role: 'owner', isYou: true, pending: false, isPrimaryOwner: true },
      { userId: 'm1', email: 'joined@vet.com', doctorName: '', role: 'member', isYou: false, pending: false, isPrimaryOwner: false },
      { userId: 'm2', email: 'pending@vet.com', doctorName: '', role: 'member', isYou: false, pending: true, isPrimaryOwner: false },
    ],
  } as unknown as UseTeamReturn,
}));
vi.mock('../hooks/useTeam', () => ({ useTeam: () => team.current }));
vi.mock('../hooks/useReminderTemplate', () => ({
  useReminderTemplate: () => ({
    loaded: true,
    template: { subject: 'Recheck for {{patient}}', body: 'Hello {{owner}}', auto: true, leadDays: 7 },
    save: vi.fn(),
  }),
}));
vi.mock('../hooks/useBilling', () => ({
  fetchBilling: () => new Promise(() => {}),
  openBillingPortal: vi.fn(),
  changePlan: vi.fn(),
}));

import { ChartSettingsModal } from './ChartSettingsModal';
import { PracticeSettingsModal } from './PracticeSettingsModal';
import { AccountModal } from './AccountModal';
import { RemindersModal } from './RemindersModal';
import { WhatsNewModal } from './WhatsNewModal';
import { WalkthroughModal } from './WalkthroughModal';
import { FeedbackModal } from './FeedbackModal';
import { OwnerReportCustomize } from './OwnerReportCustomize';
import { OwnerReportTemplatesModal } from './OwnerReportTemplatesModal';
import { ReportTemplatesModal } from './ReportTemplatesModal';
import { AdminPanel } from './AdminPanel';
import { AdminChartViewer } from './AdminChartViewer';
import { DEFAULT_CHART_PREFS } from '../utils/chartSettings';
import { defaultConfig } from '../utils/ownerReportConfig';

const profile = {
  loaded: true,
  practiceName: 'SoCal Vet',
  doctorName: 'Dr Me',
  practiceId: 'p1',
  plan: 'free',
  aiEnabled: true,
  maxImages: 10,
  dicomEnabled: false,
  ownerReportEnabled: true,
  ownerReportConfig: defaultConfig(),
  saveOwnerReportConfig: vi.fn(),
  logoUrl: '',
  update: vi.fn(),
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
} as unknown as UseProfileReturn;
const branding = { practiceName: 'SoCal Vet', doctorName: 'Dr Me', logoUrl: '' };
const noop = () => {};

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});

async function snap(ui: React.ReactElement) {
  const { container } = render(ui);
  // Let effects (focus, async loads) settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  await waitFor(() => expect(document.body.innerHTML.length).toBeGreaterThan(0));
  return { container, html: document.body.innerHTML };
}

describe('settings dialogs on the website render as before', () => {
  it('Chart settings', async () => {
    expect((await snap(<ChartSettingsModal onClose={noop} prefs={DEFAULT_CHART_PREFS} followsAccount onChange={noop} />)).html).toMatchSnapshot();
  });
  it('Chart settings, one page', async () => {
    expect((await snap(<ChartSettingsModal onClose={noop} prefs={DEFAULT_CHART_PREFS} followsAccount={false} onChange={noop} section="anesthesia" />)).html).toMatchSnapshot();
  });
  it('Practice settings', async () => {
    expect((await snap(<PracticeSettingsModal open onClose={noop} profile={profile} />)).html).toMatchSnapshot();
  });
  it('Account', async () => {
    expect((await snap(<AccountModal open onClose={noop} profile={profile} />)).html).toMatchSnapshot();
  });
  it('Recheck reminders', async () => {
    expect((await snap(<RemindersModal open onClose={noop} />)).html).toMatchSnapshot();
  });
  it('What’s new', async () => {
    expect((await snap(<WhatsNewModal onClose={noop} />)).html).toMatchSnapshot();
  });
  it('Getting started', async () => {
    expect((await snap(<WalkthroughModal open onClose={noop} />)).html).toMatchSnapshot();
  });
  it('Send feedback', async () => {
    expect((await snap(<FeedbackModal onClose={noop} section="charting" transcript="hello" />)).html).toMatchSnapshot();
  });
  it('Owner report customize', async () => {
    expect((await snap(<OwnerReportCustomize onClose={noop} config={defaultConfig()} onSave={vi.fn()} branding={branding} />)).html).toMatchSnapshot();
  });
  it('Owner report templates (read-only)', async () => {
    expect((await snap(<OwnerReportTemplatesModal open onClose={noop} config={defaultConfig()} onSave={vi.fn()} canEdit={false} roleKnown branding={branding} />)).html).toMatchSnapshot();
  });
  it('Report templates', async () => {
    const store = { templates: [{ id: 't1', name: 'Dental', body: 'Body' }], save: vi.fn(), remove: vi.fn() };
    expect((await snap(<ReportTemplatesModal open onClose={noop} store={store as never} draftBody="Draft" />)).html).toMatchSnapshot();
  });
  it('Admin panel', async () => {
    expect((await snap(<AdminPanel open onClose={noop} />)).html).toMatchSnapshot();
  });
  it('Admin chart viewer', async () => {
    expect((await snap(<AdminChartViewer data={{ nope: true }} practiceName="SoCal Vet" onClose={noop} />)).html).toMatchSnapshot();
  });
});
