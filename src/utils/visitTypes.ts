export type VisitType = 'dental' | 'consultation';

export function isVisitType(value: unknown): value is VisitType {
  return value === 'dental' || value === 'consultation';
}

/** Dental procedure is the default for records saved before visit types. */
export function visitTypeOf(value: unknown): VisitType {
  return isVisitType(value) ? value : 'dental';
}
