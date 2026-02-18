// SyncSection — Sync utilities + SyncTab component for the Sync tab

import { useState } from 'preact/hooks';
import { SYNC_ENDPOINTS } from '../../constants';
import type { ActiveProfile, EndpointSyncState, ProfileInfo, SyncState } from '../../types';
import { DateFormatter, formatDataSize, formatDuration, formatMaxAge } from '../format-utils';

// ============================================================================
// HELPERS
// ============================================================================

export function createInitialSyncState(): SyncState {
  const endpoints: Record<string, EndpointSyncState> = {};
  for (const ep of SYNC_ENDPOINTS) {
    endpoints[ep.id] = { status: 'idle', lastSync: null };
  }
  return { syncing: false, refreshingBooths: false, endpoints };
}

type OverallStatus = 'idle' | 'syncing' | 'synced' | 'partial' | 'error';

export interface GroupStatus {
  status: OverallStatus;
  lastSync: string | null;
}

export function computeGroupStatuses(
  endpoints: Record<string, EndpointSyncState>,
  syncFlags?: { syncing: boolean; refreshingBooths: boolean }
): {
  reports: GroupStatus;
  booths: GroupStatus;
} {
  function compute(group: string): GroupStatus {
    const eps = SYNC_ENDPOINTS.filter((ep) => ep.group === group);
    let syncedCount = 0;
    let errorCount = 0;
    let syncingCount = 0;
    let lastSync: string | null = null;

    for (const ep of eps) {
      const s = endpoints[ep.id];
      if (!s) continue;
      if (s.status === 'synced') syncedCount++;
      else if (s.status === 'error') errorCount++;
      else if (s.status === 'syncing') syncingCount++;
      if (s.lastSync && (!lastSync || s.lastSync > lastSync)) lastSync = s.lastSync;
    }

    let status: OverallStatus = 'idle';
    if (syncingCount > 0) status = 'syncing';
    else if (syncedCount === eps.length) status = 'synced';
    else if (errorCount > 0 && syncedCount > 0) status = 'partial';
    else if (errorCount > 0) status = 'error';
    else if (syncedCount > 0) status = 'partial';

    return { status, lastSync };
  }

  const reports = compute('reports');
  const booths = compute('booth-availability');

  // Override: if the top-level syncing flag is on, force group status to 'syncing'
  // to prevent flicker when one platform finishes before the other starts
  if (syncFlags?.syncing) reports.status = 'syncing';
  if (syncFlags?.refreshingBooths) booths.status = 'syncing';

  return { reports, booths };
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function EndpointRow({
  name,
  source,
  frequency,
  epState,
  showFrequency
}: {
  name: string;
  source: string;
  frequency: string;
  epState: EndpointSyncState;
  showFrequency: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  const statusClass =
    epState.status === 'synced' ? 'synced' : epState.status === 'error' ? 'error' : epState.status === 'syncing' ? 'syncing' : 'not-synced';

  const timestampDisplay = epState.lastSync
    ? hovered
      ? DateFormatter.toFullTimestamp(epState.lastSync)
      : DateFormatter.toFriendly(epState.lastSync)
    : epState.status === 'error'
      ? 'Failed'
      : '';

  const timestampColor = epState.status === 'error' && !epState.lastSync ? '#EF4444' : undefined;

  const statusTooltip = epState.cached ? 'Cached' : undefined;

  return (
    <tr class="endpoint-row">
      <td class="endpoint-source">{source && <span class={`source-badge ${source === 'SC' ? 'primary' : ''}`}>{source}</span>}</td>
      <td class="endpoint-name">{name}</td>
      <td class="endpoint-timestamp">
        <output
          class="sync-timestamp"
          style={{ cursor: epState.lastSync ? 'pointer' : undefined, color: timestampColor }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {timestampDisplay}
        </output>
      </td>
      <td class="endpoint-duration">{formatDuration(epState.durationMs)}</td>
      <td class="endpoint-data-size">{formatDataSize(epState.dataSize)}</td>
      {showFrequency && (
        <td class="endpoint-frequency">
          <span class="source-badge">{frequency}</span>
        </td>
      )}
      <td class="endpoint-status-cell">
        <span class={`sync-status ${statusClass}`} title={epState.error || statusTooltip}>
          {epState.status === 'syncing' ? (
            <span class="spinner" />
          ) : epState.status === 'error' && epState.httpStatus ? (
            epState.httpStatus
          ) : epState.status === 'synced' ? (
            epState.cached ? (
              'cached'
            ) : (
              200
            )
          ) : epState.status === 'error' ? (
            '\u2717'
          ) : (
            ''
          )}
        </span>
      </td>
    </tr>
  );
}

function EndpointGroupTable({
  endpoints,
  group,
  label,
  showFrequency,
  onRefresh,
  refreshing,
  readOnly
}: {
  endpoints: Record<string, EndpointSyncState>;
  group: string;
  label: string;
  showFrequency: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  readOnly?: boolean;
}) {
  const eps = SYNC_ENDPOINTS.filter((ep) => ep.group === group);
  if (eps.length === 0) return null;
  const colCount = showFrequency ? 7 : 6;

  return (
    <table class="endpoint-table">
      <tbody>
        <tr class="endpoint-group-label">
          <td colSpan={colCount}>
            <div class="endpoint-group-header">
              {label}
              {onRefresh && (
                <button type="button" class="btn btn-primary btn-sm" disabled={refreshing || readOnly} onClick={onRefresh}>
                  {refreshing ? 'Refreshing\u2026' : 'Refresh'}
                </button>
              )}
            </div>
          </td>
        </tr>
        {eps.map((ep) => {
          const epState = endpoints[ep.id] || { status: 'idle', lastSync: null };
          return (
            <EndpointRow
              key={ep.id}
              name={ep.name}
              source={ep.source}
              frequency={formatMaxAge(ep.maxAgeMs)}
              epState={epState}
              showFrequency={showFrequency}
            />
          );
        })}
      </tbody>
    </table>
  );
}

// ============================================================================
// SYNC TAB
// ============================================================================

interface SyncTabProps {
  syncState: SyncState;
  availableBoothsEnabled: boolean;
  onSyncReports: () => void;
  onRefreshBooths: () => void;
  onRecalculate: () => void;
  onExport: () => void;
  onWipeData: () => void;
  hasData: boolean;
  readOnly: boolean;
  activeProfile: ActiveProfile | null;
  profiles: ProfileInfo[];
  onSwitchProfile: (dirName: string) => void;
  onImportProfile: (name: string) => void;
  onDeleteProfile: (dirName: string) => void;
}

export function SyncTab({
  syncState,
  availableBoothsEnabled,
  onSyncReports,
  onRefreshBooths,
  onRecalculate,
  onExport,
  onWipeData,
  hasData,
  readOnly,
  activeProfile,
  profiles,
  onSwitchProfile,
  onImportProfile,
  onDeleteProfile
}: SyncTabProps) {
  const [importName, setImportName] = useState('');

  return (
    <div class="report-visual sync-tab">
      <h3>Sync Status</h3>
      <EndpointGroupTable
        endpoints={syncState.endpoints}
        group="reports"
        label="Reports"
        showFrequency={false}
        onRefresh={onSyncReports}
        refreshing={syncState.syncing}
        readOnly={readOnly}
      />
      {availableBoothsEnabled && (
        <EndpointGroupTable
          endpoints={syncState.endpoints}
          group="booth-availability"
          label="Booth Planner"
          showFrequency={false}
          onRefresh={onRefreshBooths}
          refreshing={syncState.refreshingBooths}
          readOnly={readOnly}
        />
      )}
      {profiles.length > 0 && (
        <div class="profile-section">
          <h3>Profile</h3>
          <div class="profile-controls">
            <select
              class="form-input profile-select"
              value={activeProfile?.dirName || 'default'}
              onChange={(e) => onSwitchProfile((e.target as HTMLSelectElement).value)}
            >
              {profiles.map((p) => (
                <option key={p.dirName} value={p.dirName}>
                  {p.dirName === 'default' ? 'Default' : p.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              class="form-input profile-import-input"
              placeholder="New profile name"
              value={importName}
              onInput={(e) => setImportName((e.target as HTMLInputElement).value)}
            />
            <button
              type="button"
              class="btn btn-secondary"
              disabled={!importName.trim()}
              onClick={() => {
                onImportProfile(importName.trim());
                setImportName('');
              }}
            >
              Import Data
            </button>
            {readOnly && <span class="profile-hint">Imported snapshot — syncing disabled</span>}
          </div>
          <div class="button-group" style={{ marginTop: '12px' }}>
            <button type="button" class="btn btn-secondary" onClick={onRecalculate}>
              Recalculate
            </button>
            <button type="button" class="btn btn-secondary" disabled={!hasData} onClick={onExport}>
              Export Data
            </button>
            <button type="button" class="btn btn-secondary" disabled={readOnly} onClick={onWipeData}>
              Wipe Data
            </button>
            {readOnly && (
              <button type="button" class="btn btn-secondary" onClick={() => activeProfile && onDeleteProfile(activeProfile.dirName)}>
                Delete Profile
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
