import React from 'react';
import { OwnerReportTemplatesModal } from './OwnerReportTemplatesModal';
import { useTeam, type UseTeamReturn } from '../hooks/useTeam';
import { isNativeApp } from '../native/platform';
import { usePracticeLanguage } from '../hooks/usePracticeLanguage';
import type { OwnerReportConfig } from '../utils/ownerReportConfig';

/**
 * The owner report templates editor opened straight from the Owner Report
 * page ("Customize report"), so people find it without going through
 * Practice settings. Same rules as there: practice owners edit, everyone
 * else gets a read-only view. In the iOS app it opens as a sheet over the
 * chart (the Settings tab pushes the same editor as a screen).
 */
// How the editor is presented (not text): an iOS sheet in the app, the dialog on the web.
const SHEET = 'sheet' as const;
const MODAL = 'modal' as const;

interface OwnerReportCustomizeProps {
  onClose: () => void;
  config: OwnerReportConfig;
  onSave: (config: OwnerReportConfig) => Promise<void>;
  branding: { practiceName: string; doctorName: string; logoUrl: string };
  /** Saved templates failed to load — block saving over them. */
  loadFailed?: boolean;
  aiEnabled?: boolean;
  startNew?: boolean;
}

export function OwnerReportCustomize(props: OwnerReportCustomizeProps) {
  const team = useTeam(true);
  return <OwnerReportCustomizeEditor key={team.practice?.id ?? ''} team={team} {...props} />;
}

function OwnerReportCustomizeEditor({ team, onClose, config, onSave, branding, loadFailed, aiEnabled, startNew }: OwnerReportCustomizeProps & { team: UseTeamReturn }) {
  const clientLang = usePracticeLanguage(team.practice?.id ?? null);
  return (
    <OwnerReportTemplatesModal
      open
      onClose={onClose}
      config={config}
      onSave={onSave}
      canEdit={team.loaded && team.role === 'owner'}
      roleKnown={team.loaded}
      startNew={startNew && clientLang.loaded}
      aiEnabled={aiEnabled}
      loadFailed={loadFailed}
      clientLanguage={clientLang.language}
      branding={branding}
      presentation={isNativeApp() ? SHEET : MODAL}
    />
  );
}
