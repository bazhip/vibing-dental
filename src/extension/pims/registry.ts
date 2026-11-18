import { ezyvetConfiguredSyncSource } from './configuredEzyvet';
import { diagnostics, listFields, status } from '../ezyvet/read';
import { consultPatientNumber, listAppointments } from '../ezyvet/appointments';
import { write } from '../ezyvet/write';
import { daysmart } from './daysmart';
import { instinct } from './instinct';
import { pulse } from './pulse';
import { rhapsody } from './rhapsody';
import { shepherd } from './shepherd';
import { vetspire } from './vetspire';
import { identifyPims } from './hosts';
import type { PimsAdapter, PimsId } from './types';

const ezyvet: PimsAdapter = {
  id: 'ezyvet',
  syncSource: ezyvetConfiguredSyncSource,
  status: (context) => status(context.doc),
  listFields: (context) => listFields(context.doc),
  write: (item, context) => write(item, context.doc, () => (context.currentUrl?.() ?? context.url).href === context.url.href),
  listAppointments: (date, context, options) => listAppointments(date, options ?? { navigate: false }, { doc: context.doc, wait: context.wait }),
  patientNumber: (recordId, context) => consultPatientNumber(recordId, { doc: context.doc }),
  diagnostics: (context) => diagnostics(context.doc),
};

export const PIMS_ADAPTERS: Record<PimsId, PimsAdapter> = { ezyvet, daysmart, instinct, pulse, rhapsody, shepherd, vetspire };

export function adapterFor(url: string): PimsAdapter | null {
  const id = identifyPims(url);
  return id ? PIMS_ADAPTERS[id] : null;
}
