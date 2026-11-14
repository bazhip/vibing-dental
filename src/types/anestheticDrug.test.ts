import { describe, expect, it } from 'vitest';
import { drugUnit, formatAnestheticDrug, strengthForInput, strengthHasUnit, usualConcentration, withDrugUnit } from './index';

describe('anesthetic strengths', () => {
  it('a bare number is a %, as before', () => {
    expect(formatAnestheticDrug({ name: 'Bupivacaine', concentration: '0.5' })).toBe('0.5% Bupivacaine');
    expect(formatAnestheticDrug({ name: 'Bupivacaine', concentration: '0.5%' })).toBe('0.5% Bupivacaine');
    expect(formatAnestheticDrug({ name: 'Bupivacaine', concentration: '' })).toBe('Bupivacaine');
  });
  it('a strength with its own unit prints as typed', () => {
    expect(formatAnestheticDrug({ name: 'Buprenorphine', concentration: '0.3 mg/mL' })).toBe('0.3 mg/mL Buprenorphine');
    expect(strengthHasUnit('0.3 mg/mL')).toBe(true);
    expect(strengthHasUnit('0.5')).toBe(false);
  });
  it('adjuncts use mg/mL and pre-fill their stock strength', () => {
    expect(drugUnit('dexmedetomidine')).toBe('mg/mL');
    expect(drugUnit('Lidocaine')).toBe('%');
    expect(usualConcentration('Buprenorphine')).toBe('0.3 mg/mL');
    expect(usualConcentration('Dexmedetomidine')).toBe('0.5 mg/mL');
  });
  it('a typed number gets the drug\'s unit; the box shows the number', () => {
    expect(withDrugUnit('Buprenorphine', '0.3')).toBe('0.3 mg/mL');
    expect(withDrugUnit('Buprenorphine', '10 µg/mL')).toBe('10 µg/mL');
    expect(withDrugUnit('Bupivacaine', '0.5')).toBe('0.5');
    expect(withDrugUnit('Buprenorphine', '')).toBe('');
    expect(strengthForInput('Buprenorphine', '0.3 mg/mL')).toBe('0.3');
    expect(strengthForInput('Bupivacaine', '0.5')).toBe('0.5');
  });
});
