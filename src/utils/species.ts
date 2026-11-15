import type { Species } from '../types';

/** The animal, without the dentition (what the charts table stores in
 *  `species`). */
export type SpeciesBase = 'canine' | 'feline' | 'equine';
export type Dentition = 'permanent' | 'deciduous';

export function speciesBase(species: string): SpeciesBase {
  if (species.startsWith('canine')) return 'canine';
  if (species.startsWith('equine')) return 'equine';
  return 'feline';
}

export function speciesDentition(species: string): Dentition {
  return species.endsWith('deciduous') ? 'deciduous' : 'permanent';
}

/** Dog and cat have a deciduous chart; the horse chart is adult only. */
export function hasDeciduousChart(base: SpeciesBase): boolean {
  return base !== 'equine';
}

export function combineSpecies(base: SpeciesBase, dentition: Dentition): Species {
  if (!hasDeciduousChart(base) || dentition === 'permanent') return base;
  return `${base}-deciduous` as Species;
}
