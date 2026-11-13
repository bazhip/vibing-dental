import React from 'react';
import { useTranslation } from 'react-i18next';
import { List, ListRow, ListSection } from '../List';
import { useStack } from '../Stack';
import { useAppSettings } from '../appData';
import { AccountModal } from '../../components/AccountModal';
import { PracticeSettingsModal } from '../../components/PracticeSettingsModal';
import { OwnerReportTemplatesModal } from '../../components/OwnerReportTemplatesModal';
import { RemindersModal } from '../../components/RemindersModal';
import { ChartSettingsList } from '../../components/ChartSettingsList';
import { buildAppSteps } from '../tourSteps';
import { WhatsNewModal } from '../../components/WhatsNewModal';
import { FeedbackModal } from '../../components/FeedbackModal';
import { AdminPanel } from '../../components/AdminPanel';
import { useTeam } from '../../hooks/useTeam';
import '../settings.css';

/**
 * The Settings tab's pushed screens. Each is a live component (pushed
 * screens render once; these read current data through useAppSettings)
 * wrapping the body of today's settings dialog (`presentation="screen"`),
 * so the web dialogs and the app share one implementation. Leaving a
 * screen is the stack's Back / back-swipe; screens with drafts put Save in
 * the navigation bar and ask before Back discards an edit.
 */

const SCREEN = 'screen' as const;
const CHEVRON = 'chevron' as const;

export function AccountSettingsScreen() {
  const s = useAppSettings();
  const { pop } = useStack();
  return <AccountModal open onClose={pop} profile={s.profile} language={s.language} onLanguageChange={s.setLanguage} presentation={SCREEN} />;
}

export function PracticeSettingsScreen() {
  const { t } = useTranslation();
  const s = useAppSettings();
  const { pop, push } = useStack();
  const openTemplates = () =>
    push({ id: 'owner-report-templates', title: t('ownerReport.title', { ns: 'settings' }), render: () => <OwnerReportTemplatesScreen /> });
  return <PracticeSettingsModal open onClose={pop} profile={s.profile} presentation={SCREEN} onCustomizeReport={openTemplates} />;
}

/** Practice → Owner report: owners edit, everyone else reads (as on the web). */
export function OwnerReportTemplatesScreen() {
  const { profile } = useAppSettings();
  const { pop } = useStack();
  const team = useTeam(true);
  const branding = React.useMemo(
    () => ({ practiceName: profile.practiceName, doctorName: profile.doctorName, logoUrl: profile.logoUrl }),
    [profile.practiceName, profile.doctorName, profile.logoUrl],
  );
  return (
    <OwnerReportTemplatesModal
      open
      onClose={pop}
      config={profile.ownerReportConfig}
      onSave={profile.saveOwnerReportConfig}
      canEdit={team.loaded && team.role === 'owner'}
      roleKnown={team.loaded}
      branding={branding}
      presentation={SCREEN}
    />
  );
}

export function ChartSettingsScreen() {
  const s = useAppSettings();
  return <ChartSettingsList prefs={s.prefs} followsAccount={s.prefsFollowAccount} onChange={s.setPref} only={null} />;
}

export function RemindersSettingsScreen() {
  const { pop } = useStack();
  return <RemindersModal open onClose={pop} presentation={SCREEN} />;
}

/** Getting started: replay the tour, or jump to a part of the chart. */
export function GettingStartedScreen() {
  const { t } = useTranslation('settings');
  const s = useAppSettings();
  const steps = React.useMemo(() => buildAppSteps(t, s.aiEnabled).filter((step) => step.section), [t, s.aiEnabled]);
  return (
    <List className="ios-settings">
      <ListSection footer={t('gettingStarted.tourFooter')}>
        <ListRow title={<span className="ios-row__tint">{t('gettingStarted.takeTour')}</span>} onClick={s.open.walkthrough} />
      </ListSection>
      <ListSection header={t('gettingStarted.chartParts')}>
        {steps.map((step) => (
          <ListRow
            key={step.title}
            title={step.title}
            subtitle={step.body}
            accessory={CHEVRON}
            onClick={() => step.section && s.goToSection(step.section)}
          />
        ))}
      </ListSection>
    </List>
  );
}

export function WhatsNewScreen() {
  const { pop } = useStack();
  return <WhatsNewModal onClose={pop} presentation={SCREEN} />;
}

export function FeedbackScreen() {
  const s = useAppSettings();
  const { pop } = useStack();
  // The section on screen in the Chart tab is sent as context, as on the web.
  return <FeedbackModal onClose={pop} section={s.activeSection} presentation={SCREEN} />;
}

export function AdminScreen() {
  const { pop } = useStack();
  return <AdminPanel open onClose={pop} presentation={SCREEN} />;
}
