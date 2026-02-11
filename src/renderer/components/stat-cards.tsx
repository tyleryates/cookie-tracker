// StatCards — Preact replacement for createHorizontalStats()

interface Stat {
  label: string;
  value: string | number;
  description: string;
  color?: string;
}

export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div class="stat-cards" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
      {stats.map((stat, i) => (
        <div key={i} class="stat-card">
          <div class="stat-card-label">{stat.label}</div>
          <div class="stat-card-value" style={{ color: stat.color || '#666' }}>{stat.value}</div>
          <div class="stat-card-description">{stat.description}</div>
        </div>
      ))}
    </div>
  );
}
