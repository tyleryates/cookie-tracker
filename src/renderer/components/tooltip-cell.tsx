// TooltipCell — Appends tooltip directly to document.body so it's
// completely outside any table/overflow ancestor hierarchy.

import type { ComponentChildren, JSX } from 'preact';
import { useCallback, useEffect, useRef } from 'preact/hooks';

interface TooltipCellProps {
  tooltip: string;
  children: ComponentChildren;
  style?: string | JSX.CSSProperties;
  tag?: 'td' | 'span';
  className?: string;
}

export function TooltipCell({ tooltip, children, style, tag, className }: TooltipCellProps) {
  const Tag = tag || 'td';
  const ref = useRef<HTMLTableCellElement & HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);

  const removeTip = useCallback(() => {
    if (tipRef.current) {
      tipRef.current.remove();
      tipRef.current = null;
    }
  }, []);

  const onEnter = useCallback(() => {
    if (!tooltip || !ref.current) return;
    removeTip();

    const rect = ref.current.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'tooltip-fixed';
    // Split on newlines and build DOM nodes to avoid innerHTML with
    // potentially user-influenced strings (e.g. DC customer names).
    const lines = tooltip.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(lines[i]));
    }
    document.body.appendChild(el);

    // Position centered above the element, clamped to viewport
    const tipRect = el.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4));
    const top = Math.max(4, rect.top - tipRect.height - 6);

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    tipRef.current = el;
  }, [tooltip, removeTip]);

  // Cleanup on unmount
  useEffect(() => removeTip, [removeTip]);

  return (
    <Tag ref={ref} class={className || 'tooltip-cell'} style={style} aria-label={tooltip} onMouseEnter={onEnter} onMouseLeave={removeTip}>
      {children}
    </Tag>
  );
}
