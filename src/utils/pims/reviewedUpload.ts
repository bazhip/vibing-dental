import i18n from '../../i18n';
import { createDraftBackend, draftText, renderDraftPdf, type ClinicalDraft, type DraftRef } from './drafts';
import { pimsRolloutEnabled } from './rollout';
import type { RpcClient } from './sync';
import { transferReviewedPdf, validUploadTarget, type UploadProvider, type UploadResult, type UploadTarget } from './uploads';

const fingerprint = (draft: ClinicalDraft) => JSON.stringify([draft.id, draft.chart_id, draft.practice_id, draft.version,
  draft.reviewed_version, draft.reviewed_by, draft.reviewed_at, draft.source_hash, draft.language, draft.kind, draftText(draft)]);

export async function uploadReviewedDraft(input: DraftRef & {
  target: UploadTarget; chart_link_version: number; client: RpcClient; provider: UploadProvider; alive: () => boolean;
}): Promise<UploadResult> {
  try {
    if (!pimsRolloutEnabled() || !input.alive() || !validUploadTarget(input.target)) return { state: 'blocked' };
    const target = { ...input.target };
    const client: RpcClient = { rpc: async (name, args) => {
      if (!input.alive()) throw new TypeError();
      const result = await input.client.rpc(name, args);
      if (!input.alive()) throw new TypeError();
      return result;
    } };
    const backend = createDraftBackend(client);
    const reference = { chart_id: input.chart_id, draft_id: input.draft_id, expected_version: input.expected_version };
    const draft = await backend.export(reference), before = fingerprint(draft);
    const label = i18n.getFixedT(draft.language, 'pims')(`drafts.${draft.kind}`), recordedAt = draft.source.updated_at;
    const bytes = await renderDraftPdf(draft);
    if (!input.alive() || fingerprint(await backend.export(reference)) !== before) return { state: 'blocked' };
    return transferReviewedPdf({ target, chart_id: reference.chart_id, draft_id: reference.draft_id, draft_version: reference.expected_version,
      chart_link_version: input.chart_link_version, bytes, label, recorded_at: recordedAt, client, provider: input.provider, alive: input.alive });
  } catch { return { state: 'blocked' }; }
}
