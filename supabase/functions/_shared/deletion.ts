// Shared deletion helpers for self-service account / practice deletion
// (team-api). Everything runs with the service role.
//
// Storage objects are NOT foreign-key cascaded: deleting an attachments
// row (or the user who owns it) leaves the photo/radiograph file in the
// bucket. These helpers delete the files explicitly, before the rows.

import Stripe from 'npm:stripe@18.5.0';

// deno-lint-ignore no-explicit-any
type Admin = any;

const PAGE = 1000; // PostgREST max-rows default — page past it

/** Every row of a query, paged with .range() so the max-rows cap can't
 *  silently truncate what gets deleted. `build` must apply a stable order. */
async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type AttachmentRow = { id: string; path: string | null; original_path?: string | null };

/** Attachment rows matching `filter`, with `original_path` (the DICOM
 *  original) when that column exists — older databases lack it. */
async function attachmentRows(
  admin: Admin,
  filter: (q: Admin) => Admin
): Promise<AttachmentRow[]> {
  const run = (cols: string) =>
    selectAll<AttachmentRow>((from, to) => filter(admin.from('attachments').select(cols)).order('id').range(from, to));
  try {
    return await run('id, path, original_path');
  } catch (e) {
    if (e instanceof Error && /original_path/.test(e.message)) return await run('id, path');
    throw e;
  }
}

/** Delete storage files (missing files are fine). Throws on a storage
 *  error so the caller stops BEFORE deleting rows — a retry then finishes
 *  the job instead of leaving files nobody can find. */
async function removeFiles(admin: Admin, bucket: string, paths: string[]) {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  for (const batch of chunks(unique, 100)) {
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (error) throw new Error(`Could not delete stored files: ${error.message}`);
  }
}

const filePaths = (rows: AttachmentRow[]) =>
  rows.flatMap((r) => [r.path ?? '', r.original_path ?? '']);

/** Cancel a practice's Stripe subscription immediately (no proration) so
 *  a deleted practice can't keep being charged. Throws when it can't be
 *  cancelled — the practice must not be deleted in that case. */
export async function cancelPracticeSubscription(admin: Admin, practiceId: string) {
  const { data: prac, error } = await admin
    .from('practices')
    .select('stripe_subscription_id, subscription_status')
    .eq('id', practiceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const subId = prac?.stripe_subscription_id;
  if (!subId || ['canceled', 'incomplete_expired'].includes(prac?.subscription_status)) return;
  const key = Deno.env.get('STRIPE_API_KEY');
  if (!key) {
    throw new Error('This practice has a subscription that couldn’t be cancelled automatically — contact support to delete it.');
  }
  const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  try {
    await stripe.subscriptions.cancel(subId);
  } catch (e) {
    // Already gone on Stripe's side — nothing left to bill.
    if ((e as { code?: string })?.code === 'resource_missing') return;
    throw new Error(`Couldn’t cancel the subscription: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Permanently delete a practice and every chart shared to it (with their
 * photos/radiographs), cancelling any subscription first. Members keep
 * their accounts and their private (unshared) charts; shared report
 * templates go back to being their creator's own.
 */
export async function purgePractice(admin: Admin, practiceId: string) {
  await cancelPracticeSubscription(admin, practiceId);

  const chartIds = (
    await selectAll<{ id: string }>((from, to) =>
      admin.from('charts').select('id').eq('practice_id', practiceId).order('id').range(from, to))
  ).map((r) => r.id);

  // Images shared to the practice, plus any attached to its charts
  // (belt and braces — attachments carry chart_id regardless of sharing).
  const byId = new Map<string, AttachmentRow>();
  for (const r of await attachmentRows(admin, (q) => q.eq('practice_id', practiceId))) byId.set(r.id, r);
  for (const ids of chunks(chartIds, 100)) {
    for (const r of await attachmentRows(admin, (q) => q.in('chart_id', ids))) byId.set(r.id, r);
  }
  const atts = Array.from(byId.values());

  await removeFiles(admin, 'attachments', filePaths(atts));
  await admin.storage.from('logos').remove([`${practiceId}/logo.png`]);

  for (const ids of chunks(atts.map((a) => a.id), 100)) {
    const { error } = await admin.from('attachments').delete().in('id', ids);
    if (error) throw new Error(error.message);
  }
  for (const ids of chunks(chartIds, 100)) {
    const { error } = await admin.from('charts').delete().in('id', ids);
    if (error) throw new Error(error.message);
  }
  await admin.from('report_templates').update({ practice_id: null }).eq('practice_id', practiceId);
  await admin.from('profiles').update({ practice_id: null }).eq('practice_id', practiceId);
  // practice_members rows cascade with the practice.
  const { error } = await admin.from('practices').delete().eq('id', practiceId);
  if (error) throw new Error(error.message);
}

/**
 * Delete a user's own account. Callers must already have refused primary
 * owners with other members (see team-api delete_account).
 *  - Sole owner of a practice: the practice goes too (purgePractice).
 *  - Member of someone else's practice: charts/images they shared there
 *    stay with the practice, handed to its primary owner.
 *  - Everything else of theirs is deleted: private charts, templates,
 *    images (files included), logo, and the auth user itself.
 */
export async function purgeAccount(admin: Admin, userId: string, ownedPracticeId: string | null) {
  if (ownedPracticeId) await purgePractice(admin, ownedPracticeId);

  const { data: mems } = await admin
    .from('practice_members')
    .select('practice_id, practices(owner)')
    .eq('user_id', userId);
  for (const m of mems ?? []) {
    const newOwner = (m.practices as { owner?: string } | null)?.owner;
    if (!newOwner || newOwner === userId) continue;
    for (const table of ['charts', 'report_templates', 'attachments']) {
      const { error } = await admin.from(table).update({ created_by: newOwner })
        .eq('created_by', userId).eq('practice_id', m.practice_id);
      if (error) throw new Error(error.message);
    }
  }

  // Whatever is still theirs is deleted with the account (rows cascade);
  // their files have to go explicitly.
  const own = await attachmentRows(admin, (q) => q.eq('created_by', userId));
  await removeFiles(admin, 'attachments', filePaths(own));
  await admin.storage.from('logos').remove([`${userId}/logo.png`]);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}
