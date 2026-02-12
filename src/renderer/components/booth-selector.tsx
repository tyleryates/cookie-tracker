// BoothSelector — 2-step booth picker: toggle stores, then check individual addresses

import { useEffect, useMemo, useState } from 'preact/hooks';
import { BOOTH_RESERVATION_TYPE } from '../../constants';
import type { BoothLocation } from '../../types';
import { ipcInvoke } from '../ipc';

interface BoothSelectorProps {
  currentBoothIds: number[];
  onSave: (ids: number[]) => void;
  onCancel: () => void;
}

export function BoothSelector({ currentBoothIds, onSave, onCancel }: BoothSelectorProps) {
  const [catalog, setCatalog] = useState<BoothLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set(currentBoothIds));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const booths = await ipcInvoke('fetch-booth-catalog');
        if (!cancelled) {
          setCatalog(booths);
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

  const storeGroups = useMemo(() => {
    const groups = new Map<string, BoothLocation[]>();
    for (const booth of catalog) {
      const name = booth.storeName || 'Unknown';
      const list = groups.get(name) || [];
      list.push(booth);
      groups.set(name, list);
    }
    // Sort by store name
    return new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }, [catalog]);

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
        Toggle stores to enable them, then select specific locations within each store.
      </p>

      {[...storeGroups.entries()].map(([storeName, booths]) => {
        const boothIds = booths.map((b) => b.id);
        const selectedCount = boothIds.filter((id) => selectedIds.has(id)).length;
        const allSelected = selectedCount === boothIds.length;
        const storeEnabled = selectedCount > 0;

        return (
          <div key={storeName} class="booth-card">
            <button type="button" class="booth-card-header booth-selector-store-btn" onClick={() => toggleStore(storeName)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span class="toggle-switch">
                  <input
                    type="checkbox"
                    checked={storeEnabled}
                    onClick={(e: Event) => e.stopPropagation()}
                    onChange={() => toggleStore(storeName)}
                  />
                  <span class="toggle-slider" />
                </span>
                <div style={{ textAlign: 'left' }}>
                  <strong>{storeName}</strong>
                  <div class="meta-text">
                    {selectedCount} of {booths.length} location{booths.length === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
              {allSelected && booths.length > 1 && (
                <span class="muted-text" style={{ fontSize: '0.85em' }}>
                  All selected
                </span>
              )}
            </button>

            {storeEnabled && (
              <div class="booth-card-body">
                {booths.map((booth) => {
                  const addr = [booth.address.street, booth.address.city, booth.address.state, booth.address.zip]
                    .filter(Boolean)
                    .join(', ');
                  const typeClass =
                    booth.reservationType === BOOTH_RESERVATION_TYPE.LOTTERY
                      ? 'type-lottery'
                      : booth.reservationType === BOOTH_RESERVATION_TYPE.FCFS
                        ? 'type-fcfs'
                        : 'type-default';

                  return (
                    <label key={booth.id} class="booth-selector-row">
                      <input type="checkbox" checked={selectedIds.has(booth.id)} onChange={() => toggleBooth(booth.id)} />
                      <span>{addr || `Booth #${booth.id}`}</span>
                      <span class={`booth-type-badge ${typeClass}`}>{booth.reservationType || '-'}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div class="report-toolbar" style={{ marginTop: '16px' }}>
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
