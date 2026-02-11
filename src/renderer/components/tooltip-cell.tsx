// TooltipCell — Pure CSS tooltip using data-tooltip attribute

import type { ComponentChildren, JSX } from 'preact';

interface TooltipCellProps {
  tooltip: string;
  children: ComponentChildren;
  style?: string | JSX.CSSProperties;
  tag?: 'td' | 'span';
  className?: string;
}

export function TooltipCell({ tooltip, children, style, tag, className }: TooltipCellProps) {
  const Tag = tag || 'td';
  return (
    <Tag class={className || 'tooltip-cell'} style={style} data-tooltip={tooltip || undefined}>
      {children}
    </Tag>
  );
}
