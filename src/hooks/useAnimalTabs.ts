import { useEffect, useRef, useState } from 'react';
import type { ChartSnapshot, Species } from '../types';
import type { UseChartStateReturn } from './useChartState';
import { type UseCloudSyncReturn, type DiscardAction, type ChartWorkspace } from './useCloudSync';
import { ensureChartSaved } from '../utils/ensureSaved';
import { speciesBase } from '../utils/species';
import i18n from '../i18n';
import { toast, confirmDialog, chooseDialog, promptDialog } from '../components/ui/dialogs';
import { imageDraftWorkspace } from '../utils/imageDrafts';
import { readJson, writeJson } from '../utils/storage';

export interface AnimalTab {
  id: string;
  key: string;
  name: string;
  owner: string;
  patientNumber: string;
  date: string;
  species: Species;
}

function tabOf(chart: UseChartStateReturn): AnimalTab {
  const p = chart.patientInfo;
  const number = p.patientNumber.trim().toLowerCase();
  const name = p.patientName.trim();
  const owner = (p.ownerName ?? '').trim();
  const identity = p.patientId ? ['patient', p.patientId] : number ? ['number', number] : name ? ['name', name.toLowerCase(), owner.toLowerCase()] : ['draft', chart.cloudChartId];
  return { id: chart.cloudChartId, key: JSON.stringify([speciesBase(chart.species), ...identity]), name, owner, patientNumber: p.patientNumber.trim(), date: p.date || '', species: chart.species };
}

/** Only the active chart is mounted. Cloud tabs reopen saved records;
 * standalone/trial tabs keep their snapshots for this mounted session. */
export function useAnimalTabs(chart: UseChartStateReturn, cloud: UseCloudSyncReturn, enabled: boolean) {
  const [drafts] = useState(() => new Map<string, ChartWorkspace>(
    cloud.enabled && enabled ? readJson<ChartWorkspace[]>('chart.workspaces', 1, []).filter(value => value?.id && value?.snapshot?.patientInfo).map(value => [value.id, value]) : []
  ));
  const [closedDrafts] = useState(() => new Map<string, ChartWorkspace>(readJson<ChartWorkspace[]>('chart.closedWorkspaces', 1, []).map(draft => [draft.id, draft])));
  const [tabs, setTabs] = useState<AnimalTab[]>(() => {
    const animals = new Map<string, AnimalTab>();
    for (const draft of drafts.values()) {
      if (closedDrafts.has(draft.id)) continue;
      const tab = tabOf({ cloudChartId: draft.id, patientInfo: draft.snapshot.patientInfo, species: draft.snapshot.species } as UseChartStateReturn);
      animals.set(tab.key, tab);
    }
    return Array.from(animals.values());
  });
  const [empty, setEmpty] = useState(() => closedDrafts.has(chart.cloudChartId));
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const locked = useRef(false);
  const dismissed = useRef<string | null>(closedDrafts.has(chart.cloudChartId) ? chart.cloudChartId : null);
  const local = useRef(new Map<string, { snapshot: ChartSnapshot; existing: boolean; tab: AnimalTab }>());
  const latest = useRef({ chart, cloud, tabs });
  latest.current = { chart, cloud, tabs };
  const snapshot = chart.getSnapshot();
  useEffect(() => {
    if (!enabled || dismissed.current === chart.cloudChartId) return;
    if (!cloud.enabled) local.current.set(chart.cloudChartId, { snapshot, existing: chart.openedExisting, tab: tabOf(chart) });
    const next = tabOf(chart);
    setTabs(existing => {
      const previous = cloud.enabled ? existing.filter(tab => tab.id === next.id || tab.name || drafts.has(tab.id)) : existing;
      const index = previous.findIndex(tab => tab.id === next.id || tab.key === next.key);
      if (index < 0) return [...previous, next];
      if (JSON.stringify(previous[index]) === JSON.stringify(next)) return previous;
      return previous.map((tab, i) => i === index ? next : tab);
    });
    setEmpty(false);
  }, [enabled, chart.cloudChartId, chart.chartSession, chart.patientInfo, chart.species, chart.openedExisting, cloud.enabled, snapshot, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled || !cloud.enabled || !latest.current.cloud.findImageDrafts) return;
    let cancelled = false;
    void latest.current.cloud.findImageDrafts().then(images => {
      if (cancelled) return;
      const recovered: AnimalTab[] = [];
      for (const image of images) {
        if (closedDrafts.has(image.id) || image.id === latest.current.chart.cloudChartId || drafts.has(image.id) || latest.current.tabs.some(tab => tab.id === image.id)) continue;
        const draft = imageDraftWorkspace(image.id, image.date);
        drafts.set(image.id, draft);
        recovered.push(tabOf({ cloudChartId: image.id, patientInfo: draft.snapshot.patientInfo, species: draft.snapshot.species } as UseChartStateReturn));
      }
      if (recovered.length) {
        writeJson('chart.workspaces', 1, Array.from(drafts.values()));
        setTabs(tabs => [...tabs, ...recovered]);
        toast(i18n.t('animalTabs.imagesRecovered', { ns: 'app' }), { kind: 'info', duration: 0 });
      }
    }).catch(() => { /* Offline: retain local drafts; retry recovery on the next mount. */ });
    return () => { cancelled = true; };
  }, [enabled, cloud.enabled, drafts, closedDrafts]);

  useEffect(() => {
    if (dismissed.current === chart.cloudChartId) latest.current.cloud.pauseWorkspace?.();
  }, [chart.cloudChartId]);

  const prepareLeave = async (): Promise<boolean> => {
    const current = latest.current;
    if (dismissed.current === current.chart.cloudChartId) return true;
    if (!current.cloud.enabled) return true;
    // A tab switch preserves the entire working copy and its cloud baseline.
    if (current.cloud.captureWorkspace) {
      const id = current.chart.cloudChartId;
      const draft = await current.cloud.captureWorkspace();
      if (draft.id !== id) return false;
      drafts.set(id, draft);
      writeJson('chart.workspaces', 1, Array.from(drafts.values()));
      return true;
    }
    // Legacy callers without workspace support still need a safe save gate.
    if (!current.cloud.dirty) return true;
    const saved = !!current.chart.patientInfo.patientName.trim() && await ensureChartSaved(() => ({ ...latest.current.cloud, chartId: latest.current.chart.cloudChartId }));
    if (!saved) toast(i18n.t('animalTabs.saveFirst', { ns: 'app' }), { kind: 'error' });
    return saved;
  };

  const run = async (operation: () => Promise<boolean>) => {
    if (locked.current) return false;
    locked.current = true; setBusy(true);
    try { return await operation(); }
    finally { if (dismissed.current !== latest.current.chart.cloudChartId) latest.current.cloud.resumeWorkspace?.(); locked.current = false; setBusy(false); }
  };

  const activate = async (id: string, opts?: Parameters<UseCloudSyncReturn['openChart']>[1]) => {
    const current = latest.current;
    let ok: boolean;
    if (current.cloud.enabled) {
      const draft = drafts.get(id);
      if (draft && current.cloud.restoreWorkspace && !opts?.force) { current.cloud.restoreWorkspace(draft); ok = true; }
      else ok = await current.cloud.openChart(id, { ...opts, skipConfirm: true });
    }
    else {
      const cached = local.current.get(id);
      if (!cached) return false;
      current.chart.applySnapshot(cached.snapshot, id);
      current.chart.setOpenedExisting(cached.existing);
      ok = true;
    }
    if (ok) { closedDrafts.delete(id); writeJson('chart.closedWorkspaces', 1, Array.from(closedDrafts.values())); dismissed.current = null; setEmpty(false); setRevision(n => n + 1); }
    return ok;
  };

  const openChart: UseCloudSyncReturn['openChart'] = (id, opts) => {
    if (!enabled) return cloud.openChart(id, opts);
    // Restore/duplicate-resolution callers explicitly own their replacement.
    if (opts?.force || opts?.skipConfirm) return run(() => activate(id, opts));
    return run(async () => {
      if (id === latest.current.chart.cloudChartId && dismissed.current !== id) return true;
      if (opts?.ifClean && latest.current.cloud.dirty) return false;
      if (!(await prepareLeave())) return false;
      return activate(id, opts);
    });
  };

  const close = (id: string) => run(async () => {
    const current = latest.current;
    const index = current.tabs.findIndex(tab => tab.id === id);
    if (index < 0) return false;
    if (current.cloud.hasPendingImageUpload?.(id)) {
      toast(i18n.t('animalTabs.uploadPending', { ns: 'app' }), { kind: 'info' });
      return false;
    }
    const tab = current.tabs[index];
    const draft = drafts.get(id);
    const saved = id === current.chart.cloudChartId ? current.cloud.lastSavedAt : draft?.lastSaved.chartId === id && draft.lastSaved.at;
    const imageDraft = current.cloud.enabled && (!saved || !tab.name.trim()) && await current.cloud.hasImages?.(id);
    let discard = false;
    let active = id === current.chart.cloudChartId;
    let needsConfirmation = !active && (draft?.dirty || imageDraft);
    if (active && current.cloud.enabled && (current.cloud.dirty || imageDraft)) {
      const savedNow = current.cloud.autosaveEnabled !== false && !!tab.name.trim() && await ensureChartSaved(() => ({ ...latest.current.cloud, chartId: latest.current.chart.cloudChartId }));
      needsConfirmation = !savedNow;
    }
    let discardedDraft = draft;
    if (active && needsConfirmation && current.cloud.captureWorkspace) {
      discardedDraft = await current.cloud.captureWorkspace();
    }
    const neverSaved = active ? !(current.chart.openedExisting || latest.current.cloud.lastSavedAt)
      : !(draft?.openedExisting || saved);
    if (needsConfirmation) {
      const t = i18n.getFixedT(null, 'app');
      const choice = await chooseDialog({ title: t('animalTabs.closeTitle'),
        message: t(neverSaved && imageDraft ? 'animalTabs.closeImageChoiceMessage' : 'animalTabs.closeChoiceMessage'),
        choices: [{ value: 'discard', label: t('animalTabs.closeConfirm'), destructive: true },
          { value: 'save', label: t('animalTabs.saveAndClose') }],
        cancelLabel: t('animalTabs.keepOpen') });
      if (!choice) return false;
      if (choice === 'save') {
        if (!active) {
          if (!(await prepareLeave()) || !(await activate(id))) return false;
          await new Promise(resolve => setTimeout(resolve, 0));
          if (latest.current.chart.cloudChartId !== id) return false;
          active = true;
        }
        if (!latest.current.chart.patientInfo.patientName.trim()) {
          const name = await promptDialog({ title: i18n.t('patient.name', { ns: 'forms' }),
            confirmLabel: t('animalTabs.saveAndClose'), cancelLabel: t('animalTabs.keepOpen'),
            validate: value => value.trim() ? null : i18n.t('status.needsName', { ns: 'app' }) });
          if (!name?.trim()) return false;
          latest.current.chart.setPatientInfo(previous => ({ ...previous, patientName: name.trim() }));
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (!(await ensureChartSaved(() => ({ ...latest.current.cloud, chartId: latest.current.chart.cloudChartId })))) return false;
      } else discard = true;
    }
    if (discard && neverSaved && imageDraft) await current.cloud.discardImageDraft?.(id);
    if (active) {
      if (discard) {
        discardedDraft = discardedDraft ?? (current.cloud.captureWorkspace ? await current.cloud.captureWorkspace()
          : { ...imageDraftWorkspace(id, current.chart.patientInfo.date), snapshot: current.chart.getSnapshot() });
      } else if (!(await prepareLeave())) return false;
      const remaining = current.tabs.filter(tab => tab.id !== id);
      const neighbor = remaining[Math.min(index, remaining.length - 1)];
      if (neighbor && !(await activate(neighbor.id))) return false;
      if (!neighbor) { dismissed.current = id; setEmpty(true); }
    }
    // Keep a local recovery copy; explicit closes must not auto-reopen on reload.
    // Only explicit discard of a never-saved image draft removes its uploads.
    if (discard && discardedDraft) {
      closedDrafts.set(id, discardedDraft);
      writeJson('chart.closedWorkspaces', 1, Array.from(closedDrafts.values()));
    }
    drafts.delete(id);
    writeJson('chart.workspaces', 1, Array.from(drafts.values()));
    setTabs(previous => previous.filter(tab => tab.id !== id));
    return true;
  });

  const confirmDiscardIfDirty = (action: DiscardAction) => enabled && ['newPatient', 'newVisit', 'openOther', 'importPdf'].includes(action)
    ? prepareLeave() : cloud.confirmDiscardIfDirty(action);

  const forget = (id: string) => {
    drafts.delete(id);
    local.current.delete(id);
    writeJson('chart.workspaces', 1, Array.from(drafts.values()));
    setTabs(previous => previous.filter(tab => tab.id !== id));
  };
  const activeKey = tabOf(chart).key;
  const draftVisits = Array.from(drafts.values()).filter(draft => tabOf({ cloudChartId: draft.id, patientInfo: draft.snapshot.patientInfo, species: draft.snapshot.species } as UseChartStateReturn).key === activeKey)
    .map(draft => ({ id: draft.id, date: draft.snapshot.patientInfo.date }));
  if (!draftVisits.some(visit => visit.id === chart.cloudChartId)) draftVisits.push({ id: chart.cloudChartId, date: chart.patientInfo.date });
  const signOut = async () => {
    if (Array.from(drafts.values()).some(draft => draft.id !== latest.current.chart.cloudChartId && draft.dirty)) {
      const t = i18n.getFixedT(null, 'app');
      if (!(await confirmDialog({ title: t('sync.discard.title'), message: t('sync.discard.signOut.message'), confirmLabel: t('sync.discard.signOut.confirm'), danger: true }))) return;
    }
    await cloud.signOut();
  };
  return { tabs, empty, busy, signOut, forget, draftVisits, transition: run, closedLocal: Array.from(local.current.values()).map(value => value.tab).filter(tab => !tabs.some(open => open.id === tab.id)), openChart, select: openChart, close, prepareLeave, confirmDiscardIfDirty };
}
