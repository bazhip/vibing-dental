import { useRef, useState, type PointerEvent } from 'react';

type Position = { from: number; to: number };
type Drag = Position & { pointerId: number; startY: number };

/** Reorder rows in one editor list without handling clicks on the row itself. */
export function useReorderList(
  listSelector: string,
  rowAttribute: string,
  count: number,
  move: (from: number, to: number) => void,
) {
  const [target, setTarget] = useState<Position>();
  const drag = useRef<Drag | undefined>(undefined);

  const start = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    if (event.button !== 0 || count < 2) return;
    drag.current = { pointerId: event.pointerId, from: index, to: index, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const track = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId || (!target && Math.abs(event.clientY - current.startY) < 4)) return;
    const list = event.currentTarget.closest(listSelector);
    const container = list && list.scrollHeight > list.clientHeight ? list : event.currentTarget.closest('.consultation-library__body');
    const bounds = container?.getBoundingClientRect();
    if (bounds && event.clientY < bounds.top + 32) container?.scrollBy(0, -14);
    if (bounds && event.clientY > bounds.bottom - 32) container?.scrollBy(0, 14);
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest(`[${rowAttribute}]`);
    if (!row || !list?.contains(row)) return;
    current.to = Number(row.getAttribute(rowAttribute));
    setTarget({ from: current.from, to: current.to });
  };

  const finish = (event: PointerEvent<HTMLButtonElement>, apply: boolean) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (apply) move(current.from, current.to);
    drag.current = undefined;
    setTarget(undefined);
  };

  return { target, start, track, finish };
}
