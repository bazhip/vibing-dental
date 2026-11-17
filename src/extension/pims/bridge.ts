import { normaliseName } from '../../utils/pims/patientMatch';
import type { Diagnostics } from '../ezyvet/read';
import { EXTENSION_VERSION } from '../version';
import type { AdapterContext, PimsAdapter, SendItem, Status, WriteResult, WriteTarget } from './types';

const unavailable = (): Status => ({ state: 'notConsult', patientName: null, patientNumber: null, consult: null });

export function createPageBridge(adapterNow: () => PimsAdapter | null, contextNow: () => AdapterContext) {
  return {
    version: EXTENSION_VERSION,
    status(): Status {
      const adapter = adapterNow();
      return adapter ? { ...adapter.status(contextNow()), provider: adapter.id } : unavailable();
    },
    listFields() {
      const adapter = adapterNow();
      return adapter?.listFields(contextNow()) ?? [];
    },
    async write(item: SendItem, target: WriteTarget): Promise<WriteResult> {
      const adapter = adapterNow();
      if (!adapter) return { ok: false, code: 'not_writable' };
      const context = contextNow();
      const status = adapter.status(context);
      if (status.state !== 'writable') return { ok: false, code: 'not_writable' };
      if (!target || adapter.id !== target.provider || !status.consult?.recordId || !target.consult ||
          status.consult.recordId !== target.consult.recordId || status.consult.viewId !== target.consult.viewId ||
          (status.patientName === null ? target.patientName !== null : target.patientName === null ||
            normaliseName(status.patientName) !== normaliseName(target.patientName))) {
        return { ok: false, code: 'patient_changed' };
      }
      return adapter.write(item, context);
    },
    diagnostics(): Diagnostics {
      const adapter = adapterNow();
      const context = contextNow();
      if (adapter?.diagnostics) return { ...adapter.diagnostics(context), provider: adapter.id };
      return {
        version: EXTENSION_VERSION, provider: adapter?.id, state: adapter?.status(context).state ?? 'notConsult',
        selectorHits: {}, fields: adapter?.listFields(context) ?? [],
        hasJaxmanager: false, hasHugerte: false, hasLexical: false,
      };
    },
    async listAppointments(date: string, options: { navigate: boolean }) {
      const adapter = adapterNow();
      if (!adapter) return { ok: false as const, code: 'read_failed' as const };
      const result = await adapter.listAppointments(date, contextNow(), options);
      return result.ok ? { ...result, appointments: result.appointments.map((appointment) => ({ ...appointment, provider: adapter.id })) } : result;
    },
    async consultPatientNumber(recordId: string) {
      const adapter = adapterNow();
      return adapter ? adapter.patientNumber(recordId, contextNow()) : null;
    },
  };
}
