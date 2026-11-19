import type { PhysicalExamResult } from './types';

export type ExamAttemptStore = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
};

const queues = new Map<string, Promise<void>>();
const unknown = (): PhysicalExamResult => ({ ok: false, code: 'physical_exam_outcome_unknown' });
const beforeActivation = new Set(['patient_changed', 'not_writable', 'physical_exam_template_not_found', 'supervising_doctor_not_set']);

export async function examAttemptKey(origin: string, recordId: string): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([origin, recordId.toLowerCase()]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `pims:exam-attempt:v1:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function openExamOnce(store: ExamAttemptStore, key: string, execute: () => Promise<PhysicalExamResult>): Promise<PhysicalExamResult> {
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const queued = new Promise<void>(resolve => { release = resolve; });
  queues.set(key, queued);
  await previous;
  try {
    if (await store.get(key) !== undefined) return unknown();
    const attempt = { version: 1, nonce: crypto.randomUUID() };
    await store.set(key, attempt);
    const persisted = await store.get(key);
    if (!persisted || typeof persisted !== 'object' || !('nonce' in persisted) || persisted.nonce !== attempt.nonce) return unknown();
    const result = await execute();
    if (!result.ok && beforeActivation.has(result.code)) await store.remove(key);
    return result;
  } catch { return unknown(); }
  finally {
    release();
    if (queues.get(key) === queued) queues.delete(key);
  }
}
