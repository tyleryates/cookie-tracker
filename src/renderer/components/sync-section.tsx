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
  return { syncing: false, endpoints };
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
      {showFrequency && (
        <td class="endpoint-frequency">
          <span class="source-badge">{frequency}</span>
        </td>
      )}
      <td class="endpoint-status-cell">
        <span class={`sync-status ${statusClass}`} title={statusTooltip}>
          {epState.status === 'syncing' ? <span class="spinner" /> : epState.status === 'synced' ? '\u2713' : '\u2717'}
        </span>
      </td>
    </tr>
  );
}

const ENDPOINT_GROUPS = [
  { key: 'reports', label: 'Reports' },
  { key: 'booth-availability', label: 'Booth Finder' }
] as const;

function EndpointTable({ endpoints, autoSyncEnabled }: { endpoints: Record<string, EndpointSyncState>; autoSyncEnabled: boolean }) {
  return (
    <table class="endpoint-table">
      <tbody>
        {ENDPOINT_GROUPS.map((group) => {
          const groupEndpoints = SYNC_ENDPOINTS.filter((ep) => ep.group === group.key);
          return (
            <>
              <tr class="endpoint-group-header">
                <td colSpan={autoSyncEnabled ? 5 : 4}>{group.label}</td>
              </tr>
              {groupEndpoints.map((ep) => {
                const epState = endpoints[ep.id] || { status: 'idle', lastSync: null };
                return (
                  <EndpointRow
                    key={ep.id}
                    name={ep.name}
                    source={ep.source}
                    frequency={formatMaxAge(ep.maxAgeMs)}
                    epState={epState}
                    showFrequency={autoSyncEnabled}
                  />
                );
              })}
            </>
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
  autoSyncEnabled: boolean;
  onSync: () => void;
  onToggleAutoSync: (enabled: boolean) => void;
}

export function SyncTab({ syncState, autoSyncEnabled, onSync, onToggleAutoSync }: SyncTabProps) {
  return (
    <div class="report-visual">
      <h3>Sync Status</h3>
      <EndpointTable endpoints={syncState.endpoints} autoSyncEnabled={autoSyncEnabled} />
      <div class="sync-controls">
        <button type="button" class="btn btn-secondary active" disabled={syncState.syncing} onClick={onSync}>
          Sync Now
        </button>
        <label class="toggle-switch" title="Enable automatic hourly sync">
          <input type="checkbox" checked={autoSyncEnabled} onChange={(e) => onToggleAutoSync((e.target as HTMLInputElement).checked)} />
          <span class="toggle-slider" />
          <span class="toggle-label">Auto Sync</span>
        </label>
      </div>
    </div>
  );
}
