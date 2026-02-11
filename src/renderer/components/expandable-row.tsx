// ExpandableRow — Preact replacement for event delegation scout/booth row toggle

import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

interface ExpandableRowProps {
  /** Content for the first cell (includes expand icon automatically) */
  firstCell: ComponentChildren;
  /** Remaining cell contents */
  cells: ComponentChildren[];
  /** Expandable detail content */
  detail: ComponentChildren;
  /** Total column span for the detail row */
  colSpan: number;
  /** CSS class for the main row */
  rowClass?: string;
  /** CSS class for the detail row */
  detailClass?: string;
}

export function ExpandableRow({ firstCell, cells, detail, colSpan, rowClass, detailClass }: ExpandableRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr class={rowClass || 'scout-row'} onClick={() => setExpanded(!expanded)}>
        <td>
          <span class="expand-icon">{expanded ? '▼' : '▶'}</span>
          {firstCell}
        </td>
        {cells.map((cell, i) => <td key={i}>{cell}</td>)}
      </tr>
      {expanded && (
        <tr class={detailClass || 'scout-detail'}>
          <td colSpan={colSpan}>{detail}</td>
        </tr>
      )}
    </>
  );
}
