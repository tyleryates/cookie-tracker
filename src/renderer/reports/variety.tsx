import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import {
  COOKIE_ORDER,
  COUNCIL_AVERAGES,
  getCookieColor,
  getCookieDisplayName,
  LOW_SALES_THRESHOLD,
  sortVarietiesByOrder
} from '../../cookie-constants';
import type { CookieType, UnifiedDataset } from '../../types';
import { DataTable } from '../components/data-table';
import { getVarietiesWithDefaults, isPhysicalVariety } from '../format-utils';

function EstimateDistributionModal({
  varietyStats,
  total,
  inventory,
  defaultInput,
  onClose
}: {
  varietyStats: Record<string, number>;
  total: number;
  inventory: Partial<Record<string, number>>;
  defaultInput: number;
  onClose: () => void;
}) {
  const [selectedVariety, setSelectedVariety] = useState<'total' | CookieType>('total');
  const [inputValue, setInputValue] = useState(defaultInput > 0 ? String(defaultInput) : '');
  const [showInventory, setShowInventory] = useState(true);

  const input = Number(inputValue) || 0;
  const usingCouncilAvg = total < LOW_SALES_THRESHOLD;

  // Build ratios from current popularity data or council averages
  const ratios = new Map<CookieType, number>();
  if (usingCouncilAvg) {
    const councilTotal = Object.values(COUNCIL_AVERAGES).reduce((s, v) => s + v, 0);
    for (const variety of COOKIE_ORDER) {
      if (!isPhysicalVariety(variety)) continue;
      ratios.set(variety, (COUNCIL_AVERAGES[variety] || 0) / councilTotal);
    }
  } else {
    for (const variety of COOKIE_ORDER) {
      if (!isPhysicalVariety(variety)) continue;
      ratios.set(variety, total > 0 ? (varietyStats[variety] || 0) / total : 0);
    }
  }

  // Calculate estimates
  let estimates: Map<CookieType, number | null> | null = null;
  let estimatedTotal = 0;

  if (input > 0) {
    estimates = new Map();
    if (selectedVariety === 'total') {
      for (const [variety, ratio] of ratios) {
        estimates.set(variety, Math.round(input * ratio));
      }
      estimatedTotal = input;
    } else {
      const selectedRatio = ratios.get(selectedVariety as CookieType) || 0;
      if (selectedRatio === 0) {
        // Selected variety has 0% popularity — can't back-calculate
        for (const variety of ratios.keys()) {
          estimates.set(variety, null);
        }
        estimatedTotal = 0;
      } else {
        const impliedTotal = input / selectedRatio;
        for (const [variety, ratio] of ratios) {
          estimates.set(variety, Math.round(impliedTotal * ratio));
        }
        estimatedTotal = Math.round(impliedTotal);
      }
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop dismiss
    <div class="modal-overlay" role="presentation" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div class="modal-content" role="dialog" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3 style={{ margin: 0 }}>Estimate Distribution</h3>
          <button type="button" class="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        {usingCouncilAvg && (
          <div class="info-box info-box-warning" style={{ margin: '0 0 12px' }}>
            Sales are below {LOW_SALES_THRESHOLD} packages — using council average distribution.
          </div>
        )}
        <p class="meta-text" style={{ marginTop: 0 }}>
          Enter a package count to see the estimated breakdown based on {usingCouncilAvg ? 'council averages' : 'current popularity'}.
        </p>
        <div class="modal-input-row">
          <select
            value={selectedVariety}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value as 'total' | CookieType;
              setSelectedVariety(v);
              if (showInventory) {
                const inv =
                  v === 'total'
                    ? Object.entries(inventory).reduce((s, [k, n]) => s + (isPhysicalVariety(k) ? n || 0 : 0), 0)
                    : inventory[v] || 0;
                setInputValue(inv > 0 ? String(inv) : '');
              }
            }}
          >
            <option value="total">Total Packages</option>
            {COOKIE_ORDER.filter(isPhysicalVariety).map((variety) => (
              <option key={variety} value={variety}>
                {getCookieDisplayName(variety)}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            placeholder="Count"
            value={inputValue}
            onInput={(e) => setInputValue((e.target as HTMLInputElement).value)}
          />
        </div>
        {estimates && (
          <>
            <label class="toggle-switch" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={showInventory} onChange={() => setShowInventory(!showInventory)} />
              <span class="toggle-slider" />
              <span class="toggle-label">Show current inventory</span>
            </label>
            <DataTable
              columns={showInventory ? ['Variety', 'Est.', 'Inventory', 'Diff'] : ['Variety', 'Est. Packages']}
              columnAligns={showInventory ? [undefined, 'center', 'center', 'center'] : [undefined, 'center']}
            >
              {Array.from(estimates.entries()).map(([variety, count]) => {
                const color = getCookieColor(variety);
                const inv = inventory[variety] || 0;
                const diff = count !== null ? inv - count : null;
                return (
                  <tr key={variety}>
                    <td>
                      {color && <span class="inventory-chip-dot" style={{ background: color }} />}
                      {getCookieDisplayName(variety)}
                    </td>
                    <td class="text-center">{count !== null ? count : '—'}</td>
                    {showInventory && <td class="text-center">{inv}</td>}
                    {showInventory && (
                      <td class={`text-center${diff !== null && diff < 0 ? ' pkg-out' : diff !== null && diff > 0 ? ' pkg-in' : ''}`}>
                        {diff !== null ? (diff > 0 ? `+${diff}` : diff) : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 600 }}>
                <td>Total</td>
                <td class="text-center">{estimatedTotal > 0 ? estimatedTotal : '—'}</td>
                {showInventory && (
                  <td class="text-center">{Object.entries(inventory).reduce((s, [k, v]) => s + (isPhysicalVariety(k) ? v || 0 : 0), 0)}</td>
                )}
                {showInventory &&
                  (() => {
                    const invTotal = Object.entries(inventory).reduce((s, [k, v]) => s + (isPhysicalVariety(k) ? v || 0 : 0), 0);
                    const totalDiff = estimatedTotal > 0 ? invTotal - estimatedTotal : null;
                    return (
                      <td
                        class={`text-center${totalDiff !== null && totalDiff < 0 ? ' pkg-out' : totalDiff !== null && totalDiff > 0 ? ' pkg-in' : ''}`}
                      >
                        {totalDiff !== null ? (totalDiff > 0 ? `+${totalDiff}` : totalDiff) : '—'}
                      </td>
                    );
                  })()}
              </tr>
            </DataTable>
          </>
        )}
      </div>
    </div>
  );
}

export function VarietyReport({ data, banner }: { data: UnifiedDataset; banner?: ComponentChildren }) {
  const [showModal, setShowModal] = useState(false);

  if (!data?.varieties) {
    return (
      <div class="report-visual">
        <p>No data available. Please import data first.</p>
      </div>
    );
  }

  const varieties = data.varieties;
  const varietyStats = varieties.byCookie;

  const rows = sortVarietiesByOrder(Object.entries(getVarietiesWithDefaults(varietyStats))).filter(([variety]) =>
    isPhysicalVariety(variety)
  );

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>Cookie Popularity Report</h3>
        {varieties.total > 0 && (
          <button type="button" class="btn btn-sm btn-primary" onClick={() => setShowModal(true)}>
            Estimate Distribution
          </button>
        )}
      </div>
      {banner}
      <p class="meta-text">Total: {varieties.total} packages sold</p>
      <DataTable columns={['Variety', 'Packages', 'Popularity']} columnAligns={[undefined, 'center', 'center']}>
        {rows.map(([variety, count]) => {
          const percent = varieties.total > 0 ? `${((count / varieties.total) * 100).toFixed(1)}%` : '0%';
          const color = getCookieColor(variety);
          return (
            <tr key={variety}>
              <td>
                {color && (
                  <span
                    class="inventory-chip-dot"
                    style={{ background: color, display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }}
                  />
                )}
                <strong>{getCookieDisplayName(variety)}</strong>
              </td>
              <td class="text-center">{count}</td>
              <td class="text-center">{percent}</td>
            </tr>
          );
        })}
      </DataTable>
      {showModal && (
        <EstimateDistributionModal
          varietyStats={getVarietiesWithDefaults(varietyStats)}
          total={varieties.total}
          inventory={varieties.inventory || {}}
          defaultInput={data.troopTotals.inventory}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
