// StatCards — stat card grid with optional drill-down detail

import { type ComponentChildren, Fragment } from 'preact';
import { useState } from 'preact/hooks';

/** Shared color palette for stat card values */
export const STAT_COLORS = {
  BLUE: '#1565C0',
  PINK: '#E91E63',
  GREEN: '#2E7D32',
  TEAL: '#00838F',
  PURPLE: '#7B1FA2',
  ORANGE: '#E65100',
  AMBER: '#EF6C00',
  RED: '#C62828'
} as const;

export interface Stat {
  label: string;
  value: string | number;
  description: string;
  color?: string;
  operator?: string; // '+', '−', '=', etc. — displayed before this card
  highlight?: boolean; // darker background to visually emphasize this card
  detail?: ComponentChildren; // expandable drill-down content
}

export function StatCards({ stats, defaultExpanded }: { stats: Stat[]; defaultExpanded?: number }) {
  const [expanded, setExpanded] = useState<number | null>(defaultExpanded ?? null);
  const hasOperators = stats.some((s) => s.operator);

  let columns: string;
  if (hasOperators) {
    const parts: string[] = [];
    for (let i = 0; i < stats.length; i++) {
      if (stats[i].operator) parts.push('auto');
      parts.push('1fr');
    }
    columns = parts.join(' ');
  } else {
    columns = `repeat(${stats.length}, 1fr)`;
  }

  const handleClick = (i: number) => {
    if (!stats[i].detail) return;
    if (expanded === i) return; // tab behavior — stays selected
    setExpanded(i);
  };

  return (
    <div class="stat-cards-wrapper">
      <div class="stat-cards" style={{ gridTemplateColumns: columns }}>
        {stats.map((stat, i) => {
          const cardClass = `stat-card${stat.highlight ? ' stat-card-highlight' : ''}${stat.detail ? ' stat-card-expandable' : ''}${expanded === i ? ' stat-card-active' : ''}`;
          const content = (
            <>
              <div class="stat-card-label">{stat.label}</div>
              <div class="stat-card-value" style={{ color: stat.color || '#666' }}>
                {stat.value}
              </div>
              <div class="stat-card-description">{stat.description}</div>
            </>
          );
          return (
            <Fragment key={i}>
              {stat.operator && <div class="stat-operator">{stat.operator}</div>}
              {stat.detail ? (
                <button type="button" class={cardClass} onClick={() => handleClick(i)}>
                  {content}
                </button>
              ) : (
                <div class={cardClass}>{content}</div>
              )}
            </Fragment>
          );
        })}
      </div>
      {expanded !== null && stats[expanded]?.detail && <div class="stat-card-detail">{stats[expanded].detail}</div>}
    </div>
  );
}
