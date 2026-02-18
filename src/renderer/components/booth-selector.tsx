// BoothSelector — 2-step booth picker: toggle stores, then check individual addresses

import { useEffect, useMemo, useState } from 'preact/hooks';
import type { BoothLocation } from '../../types';
import { boothTypeClass, haversineDistance } from '../format-utils';
import { ipcInvoke } from '../ipc';

interface BoothSelectorProps {
  currentBoothIds: number[];
  onSave: (ids: number[]) => void;
  onCancel: () => void;
}

export function BoothSelector({ currentBoothIds, onSave, onCancel }: BoothSelectorProps) {
  const [catalog, setCatalog] = useState<BoothLocation[]>([]);
  const [troopCoords, setTroopCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set(currentBoothIds));
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [booths, seasonal] = await Promise.all([ipcInvoke('fetch-booth-catalog'), ipcInvoke('load-seasonal-data')]);
        if (!cancelled) {
          setCatalog(booths);
          const addr = seasonal?.troop?.address;
          if (addr?.latitude && addr?.longitude) {
            setTroopCoords({ lat: addr.latitude, lng: addr.longitude });
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-expand stores that have existing selections when catalog loads
  useEffect(() => {
    if (catalog.length === 0 || currentBoothIds.length === 0) return;
    const idSet = new Set(currentBoothIds);
    const toExpand = new Set<string>();
    for (const booth of catalog) {
      if (idSet.has(booth.id)) toExpand.add(booth.storeName || 'Unknown');
    }
    if (toExpand.size > 0) setExpandedStores(toExpand);
  }, [catalog, currentBoothIds]);

  /** Distance in miles from troop to each booth (by booth id) */
  const boothDistances = useMemo(() => {
    const distances = new Map<number, number>();
    if (!troopCoords) return distances;
    for (const booth of catalog) {
      const { latitude, longitude } = booth.address;
      if (latitude && longitude) {
        distances.set(booth.id, haversineDistance(troopCoords.lat, troopCoords.lng, latitude, longitude));
      }
    }
    return distances;
  }, [catalog, troopCoords]);

  const storeGroups = useMemo(() => {
    const groups = new Map<string, BoothLocation[]>();
    for (const booth of catalog) {
      const name = booth.storeName || 'Unknown';
      const list = groups.get(name) || [];
      list.push(booth);
      groups.set(name, list);
    }
    // Sort locations within each store by distance
    for (const [, booths] of groups) {
      booths.sort(
        (a, b) => (boothDistances.get(a.id) ?? Number.POSITIVE_INFINITY) - (boothDistances.get(b.id) ?? Number.POSITIVE_INFINITY)
      );
    }
    // Sort stores by nearest booth distance, then by store name
    return new Map(
      [...groups.entries()].sort((a, b) => {
        const distA = boothDistances.get(a[1][0]?.id) ?? Number.POSITIVE_INFINITY;
        const distB = boothDistances.get(b[1][0]?.id) ?? Number.POSITIVE_INFINITY;
        return distA !== distB ? distA - distB : a[0].localeCompare(b[0]);
      })
    );
  }, [catalog, boothDistances]);

  const toggleExpanded = (storeName: string) => {
    setExpandedStores((prev) => {
      const next = new Set(prev);
      if (next.has(storeName)) next.delete(storeName);
      else next.add(storeName);
      return next;
    });
  };

  const toggleStore = (storeName: string) => {
    const booths = storeGroups.get(storeName) || [];
    const boothIds = booths.map((b) => b.id);
    const allSelected = boothIds.every((id) => selectedIds.has(id));

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of boothIds) next.delete(id);
      } else {
        for (const id of boothIds) next.add(id);
      }
      return next;
    });

    // Auto-expand when selecting, so user sees what was checked
    if (!allSelected) {
      setExpandedStores((prev) => {
        if (prev.has(storeName)) return prev;
        const next = new Set(prev);
        next.add(storeName);
        return next;
      });
    }
  };

  const toggleBooth = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div class="report-visual">
        <h3>Select Booths</h3>
        <p class="muted-text">Loading booth catalog...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div class="report-visual">
        <h3>Select Booths</h3>
        <p class="status-error">{error}</p>
        <button type="button" class="btn btn-secondary" onClick={onCancel}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div class="report-visual">
      <h3>Select Booths</h3>
      <p class="muted-text" style={{ marginTop: '-16px', marginBottom: '16px' }}>
        Click a store to expand it and select specific locations. Use the toggle to select all locations at once.
      </p>

      {[...storeGroups.entries()].map(([storeName, booths]) => {
        const boothIds = booths.map((b) => b.id);
        const selectedCount = boothIds.filter((id) => selectedIds.has(id)).length;
        const allSelected = selectedCount === boothIds.length;
        const storeEnabled = selectedCount > 0;

        const expanded = expandedStores.has(storeName);

        return (
          <div key={storeName} class="booth-card">
            <button type="button" class="booth-card-header booth-selector-store-btn" onClick={() => toggleExpanded(storeName)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = storeEnabled && !allSelected;
                  }}
                  onClick={(e: Event) => e.stopPropagation()}
                  onChange={() => toggleStore(storeName)}
                />
                <div style={{ textAlign: 'left' }}>
                  <strong>{storeName}</strong>
                  <div class="meta-text">
                    {selectedCount} of {booths.length} location{booths.length === 1 ? '' : 's'}
                    {(() => {
                      const minDist = Math.min(...booths.map((bl) => boothDistances.get(bl.id) ?? Number.POSITIVE_INFINITY));
                      return Number.isFinite(minDist) ? ` · ${minDist.toFixed(1)} mi` : '';
                    })()}
                  </div>
                </div>
              </div>
              <span class="muted-text">
                {booths.length} location{booths.length === 1 ? '' : 's'} <span class="expand-icon">{expanded ? '▼' : '▶'}</span>
              </span>
            </button>

            {expanded && (
              <div class="booth-card-body">
                {booths.map((booth) => {
                  const addr = [booth.address.street, booth.address.city, booth.address.state, booth.address.zip]
                    .filter(Boolean)
                    .join(', ');
                  const dist = boothDistances.get(booth.id);

                  return (
                    <label key={booth.id} class="booth-selector-row">
                      <input type="checkbox" checked={selectedIds.has(booth.id)} onChange={() => toggleBooth(booth.id)} />
                      <span>
                        {addr || `Booth #${booth.id}`}
                        {dist != null && <span class="muted-text">{` · ${dist.toFixed(1)} mi`}</span>}
                      </span>
                      <span class={`booth-type-badge ${boothTypeClass(booth.reservationType)}`}>{booth.reservationType || '-'}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div class="sticky-footer">
        <button type="button" class="btn btn-primary" onClick={() => onSave([...selectedIds])}>
          Save Selection ({selectedIds.size} booth{selectedIds.size === 1 ? '' : 's'})
        </button>
        <button type="button" class="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
