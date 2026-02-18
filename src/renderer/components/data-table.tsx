// DataTable — reusable table with thead/tbody

import type { ComponentChildren, JSX } from 'preact';

interface DataTableProps {
  columns: string[];
  className?: string;
  style?: string | JSX.CSSProperties;
  hint?: string;
  columnAligns?: Array<'center' | 'right' | undefined>;
  children: ComponentChildren;
}

export function DataTable({ columns, className, style, hint, columnAligns, children }: DataTableProps) {
  return (
    <>
      {hint && <p class="table-hint">{hint}</p>}
      <table class={className || 'table-normal'} style={style}>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} style={columnAligns?.[i] ? { textAlign: columnAligns[i] } : undefined}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </>
  );
}
