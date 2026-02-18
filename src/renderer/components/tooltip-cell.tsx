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
    // Safe: tooltip content is built from app constants (cookie names, colors, numbers)
    // via buildVarietyTooltip — no user-controlled strings flow into this path.
    // Using template to parse in an inert context (prevents script execution).
    const tpl = document.createElement('template');
    tpl.innerHTML = tooltip.replace(/\n/g, '<br>');
    el.appendChild(tpl.content);
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
    <Tag ref={ref} class={className || 'tooltip-cell'} style={style} onMouseEnter={onEnter} onMouseLeave={removeTip}>
      {children}
    </Tag>
  );
}
