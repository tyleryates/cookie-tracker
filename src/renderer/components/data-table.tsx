// DataTable — Preact replacement for startTable/createTableHeader/createTableRow/endTable

import type { ComponentChildren, JSX } from 'preact';

interface DataTableProps {
  columns: string[];
  className?: string;
  style?: string | JSX.CSSProperties;
  hint?: string;
  children: ComponentChildren;
}

export function DataTable({ columns, className, style, hint, children }: DataTableProps) {
  return (
    <>
      {hint && <p class="table-hint">{hint}</p>}
      <table class={className || 'table-normal'} style={style}>
        <thead>
          <tr>
            {columns.map((col, i) => <th key={i}>{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {children}
        </tbody>
      </table>
    </>
  );
}
