import type { Handover } from '../../extension/protocol';

/**
 * The extension opens `#/chart/patient?from=ezyvet` and holds the picked
 * patient for that tab. The flag and the patient live in sessionStorage
 * (this tab only): the flag waits through sign-in, and the patient survives
 * the reload that "New patient" does.
 */
export const FROM_EZYVET_KEY = 'toothops.fromEzyvet';
export const STASHED_PATIENT_KEY = 'toothops.ezyvetPatient';

export type HandoverPatient = Pick<Handover, 'patientName' | 'patientNumber' | 'ownerName'>;
/** The stash also records who picked the patient, so it never fills another account's chart. */
export type StashedPatient = HandoverPatient & Pick<Handover, 'userId'>;

const session = (): Storage | undefined => {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
};

/** Strips `?from=ezyvet` from the hash (replaceState) and remembers it for this tab. */
export function captureFromEzyvet(
  loc: Location = window.location,
  storage: Storage | undefined = session(),
  history: History = window.history,
): void {
  const hash = loc.hash;
  const q = hash.indexOf('?');
  if (q < 0) return;
  const params = new URLSearchParams(hash.slice(q + 1));
  if (params.get('from') !== 'ezyvet') return;
  params.delete('from');
  const rest = params.toString();
  const nextHash = hash.slice(0, q) + (rest ? `?${rest}` : '');
  try {
    storage?.setItem(FROM_EZYVET_KEY, '1');
  } catch {
    /* private mode — the hand-over just won't be picked up */
  }
  history.replaceState(history.state, '', `${loc.pathname}${loc.search}${nextHash}`);
}

/** True once per hand-over: reads and clears the flag. */
export function consumeFromEzyvet(storage: Storage | undefined = session()): boolean {
  try {
    if (storage?.getItem(FROM_EZYVET_KEY) !== '1') return false;
    storage.removeItem(FROM_EZYVET_KEY);
    return true;
  } catch {
    return false;
  }
}

export function stashPatient(p: StashedPatient, storage: Storage | undefined = session()): void {
  try {
    storage?.setItem(
      STASHED_PATIENT_KEY,
      JSON.stringify({ userId: p.userId, patientName: p.patientName, patientNumber: p.patientNumber, ownerName: p.ownerName }),
    );
  } catch {
    /* private mode / full — the new chart just starts blank */
  }
}

/** Reads and removes the stashed patient. */
export function takeStashedPatient(storage: Storage | undefined = session()): StashedPatient | null {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(STASHED_PATIENT_KEY) ?? null;
    storage?.removeItem(STASHED_PATIENT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof StashedPatient, unknown>>;
    if (typeof v.userId !== 'string' || typeof v.patientName !== 'string' || typeof v.patientNumber !== 'string' || typeof v.ownerName !== 'string') {
      return null;
    }
    return { userId: v.userId, patientName: v.patientName, patientNumber: v.patientNumber, ownerName: v.ownerName };
  } catch {
    return null;
  }
}
