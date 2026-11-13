import React from 'react';
import { OwnerReportTemplatesModal } from './OwnerReportTemplatesModal';
import { useTeam } from '../hooks/useTeam';
import { isNativeApp } from '../native/platform';
import type { OwnerReportConfig } from '../utils/ownerReportConfig';

/**
 * The owner report templates editor opened straight from the Owner Report
 * page ("Customize report"), so people find it without going through
 * Practice settings. Same rules as there: practice owners edit, everyone
 * else gets a read-only view. In the iOS app it opens as a sheet over the
 * chart (the Settings tab pushes the same editor as a screen).
 */
export const OwnerReportCustomize: React.FC<{
  onClose: () => void;
  config: OwnerReportConfig;
  onSave: (config: OwnerReportConfig) => Promise<void>;
  branding: { practiceName: string; doctorName: string; logoUrl: string };
}> = ({ onClose, config, onSave, branding }) => {
  const team = useTeam(true);
  return (
    <OwnerReportTemplatesModal
      open
      onClose={onClose}
      config={config}
      onSave={onSave}
      canEdit={team.loaded && team.role === 'owner'}
      roleKnown={team.loaded}
      branding={branding}
      presentation={isNativeApp() ? 'sheet' : 'modal'}
    />
  );
};
