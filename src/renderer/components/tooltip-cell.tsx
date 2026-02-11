// TooltipCell — Preact replacement for MutationObserver + Tippy.js pattern

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import tippy from 'tippy.js';
import { UI_TIMING } from '../../constants';

interface TooltipCellProps {
  tooltip: string;
  children: ComponentChildren;
  style?: string | JSX.CSSProperties;
  tag?: 'td' | 'span';
  className?: string;
}

export function TooltipCell({ tooltip, children, style, tag, className }: TooltipCellProps) {
  const ref = useRef<HTMLElement | null>(null);
  const setRef = (el: HTMLElement | null) => { ref.current = el; };

  useEffect(() => {
    if (ref.current && tooltip) {
      const instances = tippy(ref.current, {
        content: tooltip,
        allowHTML: false,
        interactive: true,
        delay: [UI_TIMING.TOOLTIP_DELAY_SHOW, UI_TIMING.TOOLTIP_DELAY_HIDE],
        placement: 'top',
        arrow: false,
        theme: 'dark',
        maxWidth: 'none',
        popperOptions: {
          modifiers: [{
            name: 'preventOverflow',
            options: { boundary: 'viewport' }
          }]
        }
      });
      return () => {
        const arr = Array.isArray(instances) ? instances : [instances];
        arr.forEach((i) => i.destroy());
      };
    }
  }, [tooltip]);

  const Tag = tag || 'td';
  return (
    <Tag ref={setRef} class={className || 'tooltip-cell'} style={style}>
      {children}
    </Tag>
  );
}
