import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

/**
 * Premium bottom sheet: rounded-3xl overlay panel with drag-to-dismiss.
 * Transform/opacity animations only. Backdrop click + Escape close it.
 */
export default function Sheet({
  open,
  onClose,
  title,
  children,
  maxHeight = '82vh',
  className = '',
}) {
  const panelRef = useRef(null);
  const dragState = useRef({ startY: 0, dy: 0, dragging: false });
  const [dragOffset, setDragOffset] = useState(0);
  const [closing, setClosing] = useState(false);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setDragOffset(0);
      onClose?.();
    }, 240);
  }, [closing, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, requestClose]);

  if (!open) return null;

  const onTouchStart = (event) => {
    dragState.current = { startY: event.touches[0].clientY, dy: 0, dragging: true };
  };
  const onTouchMove = (event) => {
    if (!dragState.current.dragging) return;
    const dy = Math.max(0, event.touches[0].clientY - dragState.current.startY);
    dragState.current.dy = dy;
    setDragOffset(dy);
  };
  const onTouchEnd = () => {
    dragState.current.dragging = false;
    if (dragState.current.dy > 96) {
      requestClose();
    } else {
      setDragOffset(0);
    }
  };

  const hidden = closing || dragOffset > 0;

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={title || 'Sheet'}>
      <div
        className="absolute inset-0 bg-slate-950/40"
        style={{
          opacity: hidden ? 0 : 1,
          transition: `opacity var(--dur-base) var(--ease-standard)`,
        }}
        onClick={requestClose}
      />
      <div
        ref={panelRef}
        className={`absolute inset-x-0 bottom-0 mx-auto flex max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl will-change-transform ${className}`}
        style={{
          maxHeight,
          transform: closing
            ? 'translate3d(0, 100%, 0)'
            : dragOffset > 0
              ? `translate3d(0, ${dragOffset}px, 0)`
              : 'translate3d(0, 0, 0)',
          transition: dragState.current.dragging ? 'none' : `transform var(--dur-sheet) var(--ease-out-expo)`,
          animation: !closing ? 'agape-sheet-in var(--dur-sheet) var(--ease-out-expo) both' : 'none',
        }}
      >
        <div
          className="flex cursor-grab items-center justify-center pb-1 pt-2.5 active:cursor-grabbing"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          aria-hidden="true"
        >
          <span className="h-1.5 w-12 rounded-full bg-slate-200" />
        </div>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3">
          {title ? (
            typeof title === 'string'
              ? <h2 className="text-base font-bold text-slate-900">{title}</h2>
              : title
          ) : <span />}
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 outline-none transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 pb-[max(1rem,var(--sab))]">
          {children}
        </div>
      </div>
    </div>
  );
}
