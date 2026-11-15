import { expect, it } from 'vitest';
import { combineSpecies, speciesBase, speciesDentition } from './species';

it('splits a layout key into animal and dentition', () => {
  expect(speciesBase('canine-deciduous')).toBe('canine');
  expect(speciesBase('feline')).toBe('feline');
  expect(speciesBase('equine')).toBe('equine');
  expect(speciesDentition('feline-deciduous')).toBe('deciduous');
  expect(speciesDentition('equine')).toBe('permanent');
});

it('combines back, with no deciduous horse chart', () => {
  expect(combineSpecies('canine', 'deciduous')).toBe('canine-deciduous');
  expect(combineSpecies('feline', 'permanent')).toBe('feline');
  expect(combineSpecies('equine', 'deciduous')).toBe('equine');
});
