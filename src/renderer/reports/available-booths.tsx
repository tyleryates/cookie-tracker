// Available Booths Report — Preact component
// Shows booth locations with filtered availability dates/times

import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { BOOTH_TIME_SLOTS, DAY_LABELS } from '../../constants';
import type { AppConfig, EndpointSyncState, UnifiedDataset } from '../../types';
import { BoothDayFilter } from '../components/booth-day-filter';
import { BoothSelector } from '../components/booth-selector';
import { boothTypeClass, DateFormatter, formatBoothDate, formatTime12h, haversineDistance } from '../format-utils';
import { ipcInvoke } from '../ipc';
import { filterAvailableDates, parseFiltersByDay, removeIgnoredSlots } from './available-booths-utils';

interface AvailableBoothsConfig {
  filters: string[];
  ignoredTimeSlots: string[];
}

interface AvailableBoothsProps {
  data: UnifiedDataset;
  config: AvailableBoothsConfig;
  appConfig: AppConfig | null;
  syncState: EndpointSyncState;
  readOnly: boolean;
  onIgnoreSlot: (boothId: number, date: string, startTime: string) => void;
  onResetIgnored: () => void;
  onRefresh: () => void;
  onSaveBoothIds: (ids: number[]) => void;
  onSaveDayFilters: (filters: string[]) => void;
  banner?: ComponentChildren;
}

export function AvailableBoothsReport({
  data,
  config,
  appConfig,
  syncState,
  readOnly,
  onIgnoreSlot,
  onResetIgnored,
  onRefresh,
  onSaveBoothIds,
  onSaveDayFilters,
  banner
}: AvailableBoothsProps) {
  const [selecting, setSelecting] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [troopCoords, setTroopCoords] = useState<{ lat: number; lng: number } | null>(null);

  const { filters, ignoredTimeSlots } = config;
  const ignoredSet = new Set(ignoredTimeSlots);
  const boothIds = appConfig?.boothIds || [];
  const boothCount = boothIds.length;
  const filterCount = filters.length;
  const isFullyConfigured = boothCount > 0 && filterCount > 0;

  const [filtersOpen, setFiltersOpen] = useState(!isFullyConfigured);

  const refreshing = syncState.status === 'syncing';

  useEffect(() => {
    (async () => {
      try {
        const seasonal = await ipcInvoke('load-seasonal-data');
        const addr = seasonal?.troop?.address;
        if (addr?.latitude && addr?.longitude) {
          setTroopCoords({ lat: addr.latitude, lng: addr.longitude });
        }
      } catch {
        // Non-critical — distance sorting is optional
      }
    })();
  }, []);

  if (!data) {
    return (
      <div class="report-visual">
        <p>No data available. Please import data first.</p>
      </div>
    );
  }

  const boothLocations = data.boothLocations || [];

  if (selecting) {
    return (
      <BoothSelector
        currentBoothIds={boothIds}
        onSave={(ids) => {
          setSelecting(false);
          onSaveBoothIds(ids);
        }}
        onCancel={() => setSelecting(false)}
      />
    );
  }

  if (filtering) {
    return (
      <BoothDayFilter
        currentFilters={filters}
        onSave={(newFilters) => {
          setFiltering(false);
          onSaveDayFilters(newFilters);
        }}
        onCancel={() => setFiltering(false)}
      />
    );
  }

  const boothDistanceMap = new Map<number, number>();
  if (troopCoords) {
    for (const loc of boothLocations) {
      const { latitude, longitude } = loc.address;
      if (latitude && longitude) {
        boothDistanceMap.set(loc.id, haversineDistance(troopCoords.lat, troopCoords.lng, latitude, longitude));
      }
    }
  }

  const boothsWithDates = boothLocations
    .filter((loc) => {
      const filtered = filterAvailableDates(loc.availableDates || [], filters);
      return removeIgnoredSlots(filtered, loc.id, ignoredSet).length > 0;
    })
    .sort((a, b) => (boothDistanceMap.get(a.id) ?? Number.POSITIVE_INFINITY) - (boothDistanceMap.get(b.id) ?? Number.POSITIVE_INFINITY));

  // Build collapsed summary text
  const filtersByDay = parseFiltersByDay(filters);
  const filterDays = [...filtersByDay.keys()].sort();
  const summaryParts: string[] = [];
  if (boothCount > 0) summaryParts.push(`${boothCount} booth${boothCount === 1 ? '' : 's'}`);
  if (filterDays.length > 0) summaryParts.push(filterDays.map((d) => DAY_LABELS[d]).join(', '));
  const collapsedSummary = summaryParts.join(' \u00B7 ');

  // Build per-day time slot detail for expanded view
  const dayTimeDetails = filterDays.map((day) => {
    const startTimes = filtersByDay.get(day)!;
    const allSlots = startTimes.size === BOOTH_TIME_SLOTS.length;
    if (allSlots) return { day, label: DAY_LABELS[day], slots: 'All times' };
    const slotLabels = [...startTimes]
      .map((start) => {
        const match = BOOTH_TIME_SLOTS.find((s) => s.start === start);
        return match?.label || start;
      })
      .sort();
    return { day, label: DAY_LABELS[day], slots: slotLabels.join(', ') };
  });

  // Build store name → count map for expanded view
  const selectedBooths = boothIds.map((id) => boothLocations.find((loc) => loc.id === id)).filter(Boolean);
  const storeNameCounts = new Map<string, number>();
  for (const loc of selectedBooths) {
    const name = loc!.storeName;
    if (name) storeNameCounts.set(name, (storeNameCounts.get(name) || 0) + 1);
  }
  const sortedStoreNames = [...storeNameCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  // Sync status display
  let syncStatusText: string;
  let syncStatusIcon: string;
  if (refreshing) {
    syncStatusText = 'Finding\u2026';
    syncStatusIcon = '';
  } else if (syncState.status === 'error') {
    syncStatusText = 'Last check failed';
    syncStatusIcon = '\u2717';
  } else if (syncState.lastSync) {
    syncStatusText = DateFormatter.toFriendly(syncState.lastSync);
    syncStatusIcon = '\u2713';
  } else {
    syncStatusText = 'Not yet checked';
    syncStatusIcon = '';
  }

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>Booth Finder</h3>
      </div>
      {banner}

      {/* Control panel — filters collapsible, button + status below */}
      <div class="filter-card">
        <button type="button" class="filter-toggle" onClick={() => setFiltersOpen(!filtersOpen)}>
          <span class="filter-toggle-icon">{filtersOpen ? '\u25BC' : '\u25B6'}</span>
          Filters
          {!filtersOpen && collapsedSummary && <span class="filter-toggle-summary">{collapsedSummary}</span>}
        </button>

        {filtersOpen && (
          <div class="available-booths-config">
            <div class="config-section">
              <div class="config-section-header">
                <span class="config-label">Booths</span>
                {!readOnly && (
                  <button type="button" class="btn btn-secondary btn-sm" onClick={() => setSelecting(true)}>
                    Select Booths
                  </button>
                )}
              </div>
              {sortedStoreNames.length > 0 ? (
                <div class="config-day-list">
                  {sortedStoreNames.map(([name, count]) => (
                    <span key={name} class="config-day-chip">
                      <strong>{name}</strong> {count > 1 ? `${count} locations` : '1 location'}
                    </span>
                  ))}
                </div>
              ) : (
                <div class="config-value muted-text">No booths selected</div>
              )}
            </div>
            <div class="config-section">
              <div class="config-section-header">
                <span class="config-label">Days & Times</span>
                {!readOnly && (
                  <button type="button" class="btn btn-secondary btn-sm" onClick={() => setFiltering(true)}>
                    Select Days & Times
                  </button>
                )}
              </div>
              {dayTimeDetails.length > 0 ? (
                <div class="config-day-list">
                  {dayTimeDetails.map((d) => (
                    <span key={d.day} class="config-day-chip">
                      <strong>{d.label}</strong> {d.slots}
                    </span>
                  ))}
                </div>
              ) : (
                <div class="config-value muted-text">No days selected</div>
              )}
            </div>
            {!readOnly && ignoredTimeSlots.length > 0 && (
              <div class="config-section">
                <div class="config-section-header">
                  <span class="config-value">
                    {ignoredTimeSlots.length} ignored time slot{ignoredTimeSlots.length === 1 ? '' : 's'}
                  </span>
                  <button type="button" class="btn btn-secondary btn-sm" onClick={onResetIgnored}>
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!readOnly && (
          <div class="booth-action-row">
            {isFullyConfigured ? (
              <button type="button" class="btn btn-primary btn-sm" disabled={refreshing} onClick={onRefresh}>
                Search
              </button>
            ) : (
              <span class="booth-sync-status">
                {boothCount === 0 && filterCount === 0
                  ? 'Select booths and days to get started'
                  : boothCount === 0
                    ? 'Select booths to get started'
                    : 'Select days to get started'}
              </span>
            )}
            {isFullyConfigured && (
              <span class="booth-sync-status">
                {refreshing && <span class="spinner" />}
                {syncStatusText}
                {syncStatusIcon && ` ${syncStatusIcon}`}
              </span>
            )}
          </div>
        )}
      </div>
      {isFullyConfigured &&
        (boothsWithDates.length === 0 ? (
          <p class="muted-text">No available booth slots found.</p>
        ) : (
          boothsWithDates.map((loc) => {
            const addrParts = [loc.address.street, loc.address.city, loc.address.state, loc.address.zip].filter(Boolean);
            const addressStr = addrParts.join(', ');
            const filtered = filterAvailableDates(loc.availableDates || [], filters);
            const dates = removeIgnoredSlots(filtered, loc.id, ignoredSet);

            return (
              <div key={loc.id} class="booth-card">
                <div class="booth-card-header">
                  <div>
                    <strong>{loc.storeName || '-'}</strong>
                    <div class="meta-text">
                      {addressStr || '-'}
                      {(() => {
                        const dist = boothDistanceMap.get(loc.id);
                        return dist != null ? ` \u00B7 ${dist.toFixed(1)} mi` : '';
                      })()}
                    </div>
                    {loc.notes && <div class="muted-text note-text">{loc.notes}</div>}
                  </div>
                  <span class={`booth-type-badge ${boothTypeClass(loc.reservationType)}`}>{loc.reservationType || '-'}</span>
                </div>

                <div class="booth-card-body">
                  {dates.map((d) => (
                    <div key={d.date} class="booth-date-group">
                      <div class="booth-date-label">{formatBoothDate(d.date)}</div>
                      {d.timeSlots.length === 0 ? (
                        <span class="muted-text">No time slots available</span>
                      ) : (
                        <div class="booth-slot-list">
                          {d.timeSlots.map((slot) => {
                            const friendly =
                              slot.startTime && slot.endTime
                                ? `${formatTime12h(slot.startTime)} \u2013 ${formatTime12h(slot.endTime)}`
                                : formatTime12h(slot.startTime) || '-';
                            const raw = slot.startTime && slot.endTime ? `${slot.startTime} \u2013 ${slot.endTime}` : slot.startTime || '-';

                            return (
                              <span key={`${d.date}-${slot.startTime}`} title={raw} class="booth-time-slot">
                                {friendly}
                                {!readOnly && (
                                  <button
                                    type="button"
                                    class="booth-slot-dismiss"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onIgnoreSlot(loc.id, d.date, slot.startTime);
                                    }}
                                    title="Ignore this time slot"
                                  >
                                    &times;
                                  </button>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        ))}
    </div>
  );
}
