export function pimsRolloutEnabled(): boolean {
  return import.meta.env.VITE_PIMS_ROLLOUT_ENABLED === 'true';
}
