// SyncSection — Sync utilities + SyncTab component for the Sync tab

import { useState } from 'preact/hooks';
import { formatMaxAge, SYNC_ENDPOINTS } from '../../constants';
import type { EndpointSyncState, SyncState } from '../../types';
import { DateFormatter } from '../format-utils';

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

export function computeOverallStatus(endpoints: Record<string, EndpointSyncState>): {
  status: OverallStatus;
  syncedCount: number;
  errorCount: number;
  syncingCount: number;
  total: number;
  lastSync: string | null;
} {
  let syncedCount = 0;
  let errorCount = 0;
  let syncingCount = 0;
  let lastSync: string | null = null;
  const total = SYNC_ENDPOINTS.length;

  for (const ep of SYNC_ENDPOINTS) {
    const s = endpoints[ep.id];
    if (!s) continue;
    if (s.status === 'synced') syncedCount++;
    else if (s.status === 'error') errorCount++;
    else if (s.status === 'syncing') syncingCount++;
    if (s.lastSync && (!lastSync || s.lastSync > lastSync)) lastSync = s.lastSync;
  }

  let status: OverallStatus = 'idle';
  if (syncingCount > 0) status = 'syncing';
  else if (syncedCount === total) status = 'synced';
  else if (errorCount > 0 && syncedCount > 0) status = 'partial';
  else if (errorCount > 0) status = 'error';
  else if (syncedCount > 0) status = 'partial';

  return { status, syncedCount, errorCount, syncingCount, total, lastSync };
}

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
// FORMAT HELPERS
// ============================================================================

function formatDuration(ms: number | undefined): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDataSize(bytes: number | undefined): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
            `HTTP ${epState.httpStatus}`
          ) : epState.status === 'synced' ? (
            '\u2713'
          ) : (
            '\u2717'
          )}
        </span>
      </td>
    </tr>
  );
}

interface EndpointTableProps {
  endpoints: Record<string, EndpointSyncState>;
  availableBoothsEnabled: boolean;
  showFrequency: boolean;
}

function EndpointTable({ endpoints, availableBoothsEnabled, showFrequency }: EndpointTableProps) {
  const reportEndpoints = SYNC_ENDPOINTS.filter((ep) => ep.group === 'reports');
  const boothEndpoints = availableBoothsEnabled ? SYNC_ENDPOINTS.filter((ep) => ep.group === 'booth-availability') : [];
  const colCount = showFrequency ? 7 : 6;

  const renderRows = (eps: ReadonlyArray<(typeof SYNC_ENDPOINTS)[number]>) =>
    eps.map((ep) => {
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
    });

  return (
    <table class="endpoint-table">
      <tbody>
        <tr class="endpoint-group-label">
          <td colSpan={colCount}>Reports</td>
        </tr>
        {renderRows(reportEndpoints)}
        {boothEndpoints.length > 0 && (
          <>
            <tr class="endpoint-group-label">
              <td colSpan={colCount}>Booth Finder</td>
            </tr>
            {renderRows(boothEndpoints)}
          </>
        )}
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
}

export function SyncTab({
  syncState,
  availableBoothsEnabled,
  onSyncReports,
  onRefreshBooths,
  onRecalculate,
  onExport,
  onWipeData,
  hasData
}: SyncTabProps) {
  return (
    <div class="report-visual">
      <h3>Data</h3>
      <EndpointTable endpoints={syncState.endpoints} availableBoothsEnabled={availableBoothsEnabled} showFrequency={false} />
      <div class="sync-controls">
        <button type="button" class="btn btn-secondary active" disabled={syncState.syncing} onClick={onSyncReports}>
          {syncState.syncing ? 'Refreshing\u2026' : 'Refresh Reports'}
        </button>
        {availableBoothsEnabled && (
          <button type="button" class="btn btn-secondary active" disabled={syncState.refreshingBooths} onClick={onRefreshBooths}>
            {syncState.refreshingBooths ? 'Refreshing\u2026' : 'Refresh Booths'}
          </button>
        )}
      </div>
      <div class="settings-danger-zone">
        <div class="button-group">
          <button type="button" class="btn btn-secondary" onClick={onRecalculate}>
            Recalculate
          </button>
          <button type="button" class="btn btn-secondary" disabled={!hasData} onClick={onExport}>
            Export Diagnostics
          </button>
          <button type="button" class="btn btn-secondary" onClick={onWipeData}>
            Wipe Data
          </button>
        </div>
      </div>
    </div>
  );
}
