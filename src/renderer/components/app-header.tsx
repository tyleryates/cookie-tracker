// AppHeader — Top-level app header with sync pills and action buttons

import * as packageJson from '../../../package.json';
import { DateFormatter } from '../format-utils';
import type { computeGroupStatuses, GroupStatus } from '../sync-utils';

// ============================================================================
// SYNC PILL
// ============================================================================

function SyncPill({ label, group }: { label: string; group: GroupStatus }) {
  let statusText: string;
  let modifier = '';
  if (group.status === 'syncing') {
    statusText = 'Syncing\u2026';
    modifier = 'syncing';
  } else if (group.status === 'error') {
    statusText = 'Failed';
    modifier = 'error';
  } else if (group.lastSync) {
    statusText = DateFormatter.toRelativeTimestamp(group.lastSync);
  } else {
    return null;
  }

  return (
    <span class={`sync-pill ${modifier}`}>
      <span class="sync-pill-label">{label}</span>
      <span class="sync-pill-status">{statusText}</span>
    </span>
  );
}

// ============================================================================
// APP HEADER
// ============================================================================

export function AppHeader({
  syncing,
  readOnly,
  groups,
  showBooths,
  settingsActive,
  onSync,
  onOpenSettings,
  isWelcome
}: {
  syncing: boolean;
  readOnly: boolean;
  groups: ReturnType<typeof computeGroupStatuses>;
  showBooths: boolean;
  settingsActive: boolean;
  onSync: () => void;
  onOpenSettings: () => void;
  isWelcome: boolean;
}) {
  return (
    <div class="app-header">
      <span class="app-header-title">
        {'\uD83C\uDF6A'} Cookie Tracker <span class="app-header-version">v{packageJson.version}</span>
      </span>
      {!isWelcome && (
        <div class="app-header-actions">
          <div class="app-header-sync-pills">
            <SyncPill label="Reports" group={groups.reports} />
            {showBooths && <SyncPill label="Booths" group={groups.booths} />}
          </div>
          <button type="button" class="icon-btn has-tooltip" disabled={syncing || readOnly} onClick={onSync} aria-label="Refresh data">
            {syncing ? <span class="spinner" /> : '\u21BB'}
            <span class="btn-tooltip">Refresh Data</span>
          </button>
          <button
            type="button"
            class={`icon-btn has-tooltip${settingsActive ? ' active' : ''}`}
            onClick={onOpenSettings}
            aria-label="Settings"
          >
            {'\u2699'}
            <span class="btn-tooltip">Settings</span>
          </button>
        </div>
      )}
    </div>
  );
}
