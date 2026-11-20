import type { useReorderList } from '../../hooks/useReorderList';
import './ReorderHandle.css';

/** One pointer handle per row, with the same up/down action from the keyboard. */
export function ReorderHandle({ index, label, reorder, disabled }: {
  index: number;
  label: string;
  reorder: ReturnType<typeof useReorderList>;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="reorder-handle"
      aria-label={label}
      aria-keyshortcuts="ArrowUp ArrowDown"
      disabled={disabled}
      onPointerDown={(event) => reorder.start(event, index)}
      onPointerMove={reorder.track}
      onPointerUp={(event) => reorder.finish(event, true)}
      onPointerCancel={(event) => reorder.finish(event, false)}
      onLostPointerCapture={(event) => reorder.finish(event, false)}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        const button = event.currentTarget;
        if (reorder.moveByKey(index, event.key === 'ArrowUp' ? -1 : 1)) {
          requestAnimationFrame(() => {
            if (button.isConnected && document.activeElement === document.body) button.focus({ preventScroll: true });
          });
        }
      }}
    >
      <span aria-hidden="true">⠿</span>
    </button>
  );
}
