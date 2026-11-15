import React from 'react';
import type { Species } from '../types';

/** The open chart's species, for code lookups deep in the forms
 *  (CodeField autocomplete, the code reference panels): horse charts
 *  also offer the equine AVDC codes. Unset = dog/cat catalog. */
export const CodeSpeciesContext = React.createContext<Species | undefined>(undefined);
