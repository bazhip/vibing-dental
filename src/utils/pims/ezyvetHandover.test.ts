import { describe, it, expect, beforeEach } from 'vitest';
import {
  captureFromEzyvet,
  consumeFromEzyvet,
  stashPatient,
  takeStashedPatient,
  FROM_EZYVET_KEY,
  STASHED_PATIENT_KEY,
} from './ezyvetHandover';

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('captureFromEzyvet', () => {
  it('strips ?from=ezyvet from the hash and remembers it once', () => {
    window.history.replaceState(null, '', '/#/chart/patient?from=ezyvet');
    captureFromEzyvet();
    expect(window.location.hash).toBe('#/chart/patient');
    expect(window.sessionStorage.getItem(FROM_EZYVET_KEY)).toBe('1');
    expect(consumeFromEzyvet()).toBe(true);
    expect(consumeFromEzyvet()).toBe(false);
  });

  it('keeps other hash parameters', () => {
    window.history.replaceState(null, '', '/#/chart/patient?a=1&from=ezyvet');
    captureFromEzyvet();
    expect(window.location.hash).toBe('#/chart/patient?a=1');
    expect(consumeFromEzyvet()).toBe(true);
  });

  it('leaves other hashes untouched', () => {
    for (const h of ['#/library', '#/chart/patient?from=other', '#/chart/patient', '']) {
      window.history.replaceState(null, '', `/${h}`);
      captureFromEzyvet();
      expect(window.location.hash).toBe(h);
      expect(consumeFromEzyvet()).toBe(false);
    }
  });
});

describe('stashPatient / takeStashedPatient', () => {
  it('round-trips once', () => {
    stashPatient({ userId: 'u1', patientName: 'Bella', patientNumber: '123', ownerName: 'Smith' });
    expect(takeStashedPatient()).toEqual({ userId: 'u1', patientName: 'Bella', patientNumber: '123', ownerName: 'Smith' });
    expect(takeStashedPatient()).toBeNull();
  });

  it('ignores a malformed entry and removes it', () => {
    window.sessionStorage.setItem(STASHED_PATIENT_KEY, '{nope');
    expect(takeStashedPatient()).toBeNull();
    expect(window.sessionStorage.getItem(STASHED_PATIENT_KEY)).toBeNull();
    window.sessionStorage.setItem(STASHED_PATIENT_KEY, JSON.stringify({ patientName: 3 }));
    expect(takeStashedPatient()).toBeNull();
    // A stash without a user is never trusted.
    window.sessionStorage.setItem(STASHED_PATIENT_KEY, JSON.stringify({ patientName: 'B', patientNumber: '1', ownerName: 'S' }));
    expect(takeStashedPatient()).toBeNull();
  });
});
