// SyncSection — Sync status rows, progress bars, dataset selector, controls
// Sub-components defined in-file since they're small and only used here.

import { useState } from 'preact/hooks';
import type { StatusMessage } from '../app-reducer';
import type { DatasetEntry } from '../data-loader';
import { DateFormatter } from '../format-utils';

// ============================================================================
// TYPES
// ============================================================================

export interface SourceSyncState {
  status: 'idle' | 'syncing' | 'synced' | 'error';
  lastSync: string | null;
  progress: number;
  progressText: string;
  errorMessage?: string;
}

export interface SyncState {
  syncing: boolean;
  dc: SourceSyncState;
  sc: SourceSyncState;
  booth: SourceSyncState;
}

export function createInitialSyncState(): SyncState {
  return {
    syncing: false,
    dc: { status: 'idle', lastSync: null, progress: 0, progressText: '' },
    sc: { status: 'idle', lastSync: null, progress: 0, progressText: '' },
    booth: { status: 'idle', lastSync: null, progress: 0, progressText: '' }
  };
}

interface SyncSectionProps {
  syncState: SyncState;
  datasets: DatasetEntry[];
  currentDatasetIndex: number;
  autoSyncEnabled: boolean;
  statusMessage: StatusMessage | null;
  showSetupHint: boolean;
  onSync: () => void;
  onToggleAutoSync: (enabled: boolean) => void;
  onDatasetChange: (index: number) => void;
  onConfigureLogins: () => void;
  onRecalculate: () => void;
  onExport: () => void;
  hasData: boolean;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function SourceStatus({
  label,
  badge,
  status,
  lastSync
}: {
  label: string;
  badge: string;
  status: SourceSyncState['status'];
  lastSync: string | null;
}) {
  const [hovered, setHovered] = useState(false);

  const statusIcon = status === 'synced' ? '✓' : status === 'error' ? '✗' : status === 'syncing' ? '...' : '✗';
  const statusClass = status === 'synced' ? 'synced' : status === 'error' ? 'error' : status === 'syncing' ? 'syncing' : 'not-synced';

  const timestampDisplay = lastSync
    ? hovered
      ? DateFormatter.toFullTimestamp(lastSync)
      : DateFormatter.toFriendly(lastSync)
    : status === 'error'
      ? 'Failed'
      : 'Never synced';

  const timestampColor = status === 'error' ? '#EF4444' : lastSync ? '#666' : undefined;

  return (
    <div class="sync-status-row">
      <div class="sync-source-label">
        <strong>{label}</strong>
        <span class="source-badge">{badge}</span>
      </div>
      <div class="sync-source-status">
        <span class={`sync-status ${statusClass}`}>{statusIcon}</span>
        <output
          class="sync-timestamp"
          style={{ cursor: lastSync ? 'pointer' : undefined, color: timestampColor }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {timestampDisplay}
        </output>
      </div>
    </div>
  );
}

function ProgressBar({ visible, progress, text }: { visible: boolean; progress: number; text: string }) {
  if (!visible) return null;
  return (
    <div class="scrape-progress" style={{ display: 'block' }}>
      <div class="progress-bar">
        <div class="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div class="progress-text">{text}</div>
    </div>
  );
}

function DatasetSelector({
  datasets,
  selectedIndex,
  onChange
}: {
  datasets: DatasetEntry[];
  selectedIndex: number;
  onChange: (index: number) => void;
}) {
  return (
    <div class="dataset-selector">
      <label for="datasetSelect">Dataset:</label>
      <select
        id="datasetSelect"
        class="form-input"
        value={String(selectedIndex)}
        onChange={(e) => {
          const idx = parseInt((e.target as HTMLSelectElement).value, 10);
          if (!Number.isNaN(idx)) onChange(idx);
        }}
      >
        {datasets.length === 0 ? (
          <option value="">No data</option>
        ) : (
          datasets.map((ds, i) => {
            const parts: string[] = [];
            if (ds.scFile) parts.push('SC');
            if (ds.dcFile) parts.push('DC');
            return (
              <option key={i} value={String(i)}>
                {ds.label} [{parts.join('+')}]
              </option>
            );
          })
        )}
      </select>
    </div>
  );
}

function SyncControls({
  syncing,
  autoSyncEnabled,
  onSync,
  onToggleAutoSync
}: {
  syncing: boolean;
  autoSyncEnabled: boolean;
  onSync: () => void;
  onToggleAutoSync: (enabled: boolean) => void;
}) {
  return (
    <div class="sync-controls">
      <button type="button" class="btn btn-secondary active" disabled={syncing} onClick={onSync}>
        Sync Now
      </button>
      <label class="toggle-switch" title="Enable automatic hourly sync">
        <input type="checkbox" checked={autoSyncEnabled} onChange={(e) => onToggleAutoSync((e.target as HTMLInputElement).checked)} />
        <span class="toggle-slider" />
        <span class="toggle-label">Auto-sync hourly</span>
      </label>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SyncSection({
  syncState,
  datasets,
  currentDatasetIndex,
  autoSyncEnabled,
  statusMessage,
  showSetupHint,
  onSync,
  onToggleAutoSync,
  onDatasetChange,
  onConfigureLogins,
  onRecalculate,
  onExport,
  hasData
}: SyncSectionProps) {
  const showScProgress = syncState.sc.status === 'syncing' && syncState.sc.progress > 0;
  const showDcProgress = syncState.dc.status === 'syncing' && syncState.dc.progress > 0;

  return (
    <>
      <div class="sync-card" style={{ borderColor: '#4CAF50', borderWidth: '3px' }}>
        <SourceStatus label="Smart Cookie" badge="Sales & inventory" status={syncState.sc.status} lastSync={syncState.sc.lastSync} />
        <ProgressBar visible={showScProgress} progress={syncState.sc.progress} text={syncState.sc.progressText} />

        <SourceStatus label="Digital Cookie" badge="Orders & customers" status={syncState.dc.status} lastSync={syncState.dc.lastSync} />
        <ProgressBar visible={showDcProgress} progress={syncState.dc.progress} text={syncState.dc.progressText} />

        <SourceStatus label="Booth Availability" badge="Every 15 min" status={syncState.booth.status} lastSync={syncState.booth.lastSync} />
        <ProgressBar
          visible={syncState.booth.status === 'syncing' && syncState.booth.progress > 0}
          progress={syncState.booth.progress}
          text={syncState.booth.progressText}
        />

        <SyncControls syncing={syncState.syncing} autoSyncEnabled={autoSyncEnabled} onSync={onSync} onToggleAutoSync={onToggleAutoSync} />

        {statusMessage && (
          <div class={`sync-status-message ${statusMessage.type}`} style={{ display: 'block' }}>
            {statusMessage.msg}
          </div>
        )}
      </div>

      {showSetupHint && (
        <p class="table-hint" style={{ marginTop: '10px' }}>
          {'💡 First time? Click "Configure Logins" to set up credentials, then use "Sync Now" to download data'}
        </p>
      )}

      <div class="button-group" style={{ marginTop: '20px' }}>
        <button type="button" class="btn btn-secondary" onClick={onConfigureLogins}>
          {'⚙️ Configure Logins'}
        </button>
        <button type="button" class="btn btn-secondary" onClick={onRecalculate}>
          {'🔄 Recalculate'}
        </button>
        <button type="button" class="btn btn-secondary" disabled={!hasData} onClick={onExport}>
          {'💾 Download Data'}
        </button>
        <DatasetSelector datasets={datasets} selectedIndex={currentDatasetIndex} onChange={onDatasetChange} />
      </div>
    </>
  );
}
