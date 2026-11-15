import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { diagnostics, listFieldElements, listFields, status } from './read';

const dir = resolve(__dirname, '__fixtures__');
function load(name: string) {
  document.body.innerHTML = readFileSync(resolve(dir, name), 'utf8');
}
const fixtureNoteTexts = ['Fixture history text', 'Fixture plan text'];

describe('ezyVet read side', () => {
  beforeEach(() => load('consult-medical.html'));

  it('writable consult on Medical tab', () => {
    expect(status()).toEqual({ state: 'writable', patientName: 'Testdog' });
  });
  it('patient record is notConsult', () => {
    load('patient-record.html');
    expect(status()).toEqual({ state: 'notConsult', patientName: null });
  });
  it('locked', () => {
    load('consult-locked.html');
    expect(status().state).toBe('locked');
  });
  it('combined (also covers data-record-class on a wrapper)', () => {
    load('consult-combined.html');
    expect(status().state).toBe('combined');
  });
  it('notMedicalTab when another sub-tab is active', () => {
    document.getElementById('subTab1-Medical')!.classList.remove('active');
    document.getElementById('subTab1-Overview')!.classList.add('active');
    expect(status().state).toBe('notMedicalTab');
  });
  it('data-record-class other than Consult is notConsult', () => {
    document.getElementById('rtab1details')!.setAttribute('data-record-class', 'Animal');
    expect(status().state).toBe('notConsult');
  });
  it('patientName is null when the header is missing', () => {
    document.querySelector('.consultHeader')!.remove();
    expect(status().patientName).toBeNull();
  });
  it('lists fields with kinds', () =>
    expect(listFields()).toEqual(
      expect.arrayContaining([
        { title: 'History', kind: 'note', acceptsImage: false },
        { title: 'Physical Exam', kind: 'note', acceptsImage: false },
        { title: 'Assessment', kind: 'note', acceptsImage: false },
        { title: 'Plan', kind: 'note', acceptsImage: false },
        { title: 'Vet Communication', kind: 'popup', acceptsImage: false },
        { title: 'Client Communication > Email', kind: 'email', acceptsImage: true },
        { title: 'Client Communication > In Person', kind: 'inPerson', acceptsImage: false },
        { title: 'Discharge Summary', kind: 'dischargeSummary', acceptsImage: true },
      ]),
    ));
  it('lists each title once and no bare Client Communication or discharge popup entry', () => {
    const titles = listFields().map((f) => f.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles).not.toContain('Client Communication');
    expect(titles).not.toContain('Discharge Summaries');
    expect(titles).toHaveLength(8);
  });
  it('strips counts from titles', () => expect(listFields().map((f) => f.title)).not.toContain('Plan (2)'));
  it('prefers the visible duplicate (hidden copy comes first)', () => {
    const plans = Array.from(document.querySelectorAll('.sectionContent')).filter((s) =>
      s.querySelector('h2')?.textContent?.startsWith('Plan'),
    );
    expect(plans).toHaveLength(2);
    expect(plans[0].hasAttribute('hidden')).toBe(true);
    const plan = listFieldElements().find((f) => f.title === 'Plan')!;
    expect(plan.node).toBe(plans[1]);
  });
  it('lists Discharge Summary once even when its section has no DischargeSummaries class', () => {
    document.querySelector('.sectionContent[class*="DischargeSummaries"]')!.className = 'sectionContent';
    const hits = listFields().filter((f) => /discharge/i.test(f.title));
    expect(hits).toEqual([{ title: 'Discharge Summary', kind: 'dischargeSummary', acceptsImage: true }]);
  });
  it('locked on the Medical tab reports locked', () => {
    load('consult-locked.html');
    expect(document.getElementById('subTab1-Medical')!.classList.contains('active')).toBe(true);
    expect(status().state).toBe('locked');
  });
  it('no fields outside the active consult', () => {
    load('patient-record.html');
    expect(listFields()).toEqual([]);
  });
  it('diagnostics carry no page text', () => {
    const json = JSON.stringify(diagnostics());
    expect(json).not.toContain('Testdog');
    for (const s of fixtureNoteTexts) expect(json).not.toContain(s);
  });
  it('diagnostics report counts keyed by selector constant name', () => {
    const d = diagnostics();
    expect(d.version).toBe('dev');
    expect(d.state).toBe('writable');
    expect(d.selectorHits.ACTIVE_PANE).toBe(1);
    expect(d.selectorHits.LOCKED_TOOLBAR).toBe(0);
    expect(d.selectorHits.PATIENT_NAME).toBe(1);
    expect(d.selectorHits.POPUP_ADD_BUTTON).toBe(3);
    expect(d.fields).toEqual(listFields());
    expect(d).toMatchObject({ hasJaxmanager: false, hasHugerte: false, hasLexical: false });
  });
  it('diagnostics detect jaxmanager, hugerte and a Lexical editor', () => {
    const w = window as unknown as Record<string, unknown>;
    w.jaxmanager = {};
    w.hugerte = {};
    (document.querySelector('[contenteditable="true"]') as unknown as Record<string, unknown>).__lexicalEditor = {};
    try {
      expect(diagnostics()).toMatchObject({ hasJaxmanager: true, hasHugerte: true, hasLexical: true });
    } finally {
      delete w.jaxmanager;
      delete w.hugerte;
    }
  });
});
