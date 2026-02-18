// ScoutCreditChips — shared chip display for per-scout allocation breakdowns

export function ScoutCreditChips({ credits, unit }: { credits: Array<{ name: string; total: number }>; unit: string }) {
  if (credits.length === 0) {
    return (
      <div class="booth-detail-content muted-text">No scout allocations yet. Distribute in Smart Cookie to see per-scout breakdown.</div>
    );
  }

  credits.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div class="booth-detail-content">
      {credits.map(({ name, total }) => (
        <div key={name} class="booth-allocation-chip">
          <strong>{name}</strong>
          <span class="booth-allocation-credit">
            {total} {total === 1 ? unit : `${unit}s`}
          </span>
        </div>
      ))}
    </div>
  );
}
