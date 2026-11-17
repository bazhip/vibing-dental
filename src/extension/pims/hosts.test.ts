import { describe, expect, it } from 'vitest';
import { identifyPims, PIMS_HOST_PERMISSIONS } from './hosts';
import manifest from '../manifest.json';

describe('PIMS origin registry', () => {
  it.each([
    ['https://clinic.ezyvet.com/', 'ezyvet'],
    ['https://clinic.vettersoftware.com/', 'daysmart'],
    ['https://app.shepherd.vet/', 'shepherd'],
    ['https://clinic.instinctvet.cloud/', 'instinct'],
    ['https://clinic.instinctvet.com/', 'instinct'],
    ['https://clinic.evetpractice.com/Exams/1', 'pulse'],
    ['https://app.rhapsody.vet/', 'rhapsody'],
    ['https://app.vetspire.com/', 'vetspire'],
  ])('recognizes %s', (url, provider) => expect(identifyPims(url)).toBe(provider));

  it.each([
    'https://ezyvet.com.attacker.test/', 'https://evilvetspire.com/',
    'https://attacker.test/?host=shepherd.vet', 'http://clinic.ezyvet.com/',
    'https://user:secret@clinic.ezyvet.com/', 'not a url',
  ])('refuses an unrelated or insecure origin %s', (url) => expect(identifyPims(url)).toBeNull());

  it('matches manifest grants without expanding external messaging access', () => {
    expect(manifest.host_permissions).toEqual(PIMS_HOST_PERMISSIONS);
    expect(manifest.externally_connectable.matches).toEqual(['https://toothops.app/*', 'http://localhost:5173/*']);
  });
});
