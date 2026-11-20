import { useRef, useState, type PointerEvent } from 'react';

type Position = { from: number; to: number };
type Drag = Position & { pointerId: number; startY: number };

function scrollContainer(element: HTMLElement | null): HTMLElement | undefined {
  for (let parent = element; parent; parent = parent.parentElement) {
    if (parent.scrollHeight > parent.clientHeight && /^(auto|scroll|overlay)$/.test(getComputedStyle(parent).overflowY)) {
      return parent;
    }
  }
  return undefined;
}

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
    if (event.button !== 0 || count < 2 || drag.current) return;
    drag.current = { pointerId: event.pointerId, from: index, to: index, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const track = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId || (!target && Math.abs(event.clientY - current.startY) < 4)) return;
    const list = event.currentTarget.closest(listSelector);
    const container = scrollContainer(list instanceof HTMLElement ? list : null);
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
    if (apply && current.from !== current.to) move(current.from, current.to);
    drag.current = undefined;
    setTarget(undefined);
  };

  const moveByKey = (index: number, offset: -1 | 1) => {
    const destination = index + offset;
    if (destination < 0 || destination >= count) return false;
    move(index, destination);
    return true;
  };

  const dropAt = (index: number) => target?.to === index && target.from !== index
    ? target.from < index ? 'after' : 'before'
    : undefined;

  return { target, start, track, finish, moveByKey, dropAt };
}
