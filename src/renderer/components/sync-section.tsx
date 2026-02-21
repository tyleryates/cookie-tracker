// SyncSection — Sync status display and health check components

import { useState } from 'preact/hooks';
import { SYNC_ENDPOINTS, SYNC_STATUS, WARNING_TYPE } from '../../constants';
import type { EndpointSyncState, HealthChecks, SyncState, Warning } from '../../types';
import { formatDataSize, formatDuration, formatFullTimestamp, formatMaxAge, formatRelativeTimestamp } from '../format-utils';

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function statusIcon(ep: EndpointSyncState) {
  if (ep.status === SYNC_STATUS.SYNCING) return <span class="spinner" />;
  if (ep.status === SYNC_STATUS.ERROR) return ep.httpStatus || '\u2717';
  if (ep.status === SYNC_STATUS.SYNCED) return ep.cached ? 'cached' : 200;
  return '';
}

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

  const STATUS_CLASS: Record<EndpointSyncState['status'], string> = {
    [SYNC_STATUS.SYNCED]: 'synced',
    [SYNC_STATUS.ERROR]: 'error',
    [SYNC_STATUS.SYNCING]: 'syncing',
    [SYNC_STATUS.IDLE]: 'not-synced'
  };
  const statusClass = STATUS_CLASS[epState.status];

  const timestampDisplay = epState.lastSync
    ? hovered
      ? formatFullTimestamp(epState.lastSync)
      : formatRelativeTimestamp(epState.lastSync)
    : epState.status === SYNC_STATUS.ERROR
      ? 'Failed'
      : '';

  const timestampColor = epState.status === SYNC_STATUS.ERROR && !epState.lastSync ? '#EF4444' : undefined;

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
          {statusIcon(epState)}
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
  readOnly,
  autoEnabled,
  onToggleAuto
}: {
  endpoints: Record<string, EndpointSyncState>;
  group: string;
  label: string;
  showFrequency: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  readOnly?: boolean;
  autoEnabled?: boolean;
  onToggleAuto?: (enabled: boolean) => void;
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
              <span class="endpoint-group-controls">
                {onToggleAuto && (
                  <label class="toggle-switch toggle-inline">
                    <span class="toggle-label">Auto sync</span>
                    <input
                      type="checkbox"
                      checked={autoEnabled}
                      disabled={readOnly}
                      onChange={(e) => onToggleAuto((e.target as HTMLInputElement).checked)}
                    />
                    <span class="toggle-slider" />
                  </label>
                )}
                {onRefresh && (
                  <button type="button" class="btn btn-primary btn-sm" disabled={refreshing || readOnly} onClick={onRefresh}>
                    {refreshing ? 'Refreshing\u2026' : 'Refresh'}
                  </button>
                )}
              </span>
            </div>
          </td>
        </tr>
        {eps.map((ep) => {
          const epState = endpoints[ep.id] || { status: SYNC_STATUS.IDLE, lastSync: null };
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
// DATA HEALTH CHECKS
// ============================================================================

const DATA_CHECKS: { key: keyof HealthChecks; label: string; warningType: string }[] = [
  { key: 'unknownOrderTypes', label: 'Order Types', warningType: WARNING_TYPE.UNKNOWN_ORDER_TYPE },
  { key: 'unknownPaymentMethods', label: 'Payment Methods', warningType: WARNING_TYPE.UNKNOWN_PAYMENT_METHOD },
  { key: 'unknownTransferTypes', label: 'Transfer Types', warningType: WARNING_TYPE.UNKNOWN_TRANSFER_TYPE },
  { key: 'unknownCookieIds', label: 'Cookie IDs', warningType: WARNING_TYPE.UNKNOWN_COOKIE_ID }
];

export function DataHealthChecks({ healthChecks, warnings }: { healthChecks: HealthChecks; warnings: Warning[] }) {
  const hasIssues = DATA_CHECKS.some((c) => healthChecks[c.key] > 0);

  return (
    <div>
      <h3>Data Health</h3>
      <table class="endpoint-table">
        <tbody>
          {DATA_CHECKS.map((check) => {
            const count = healthChecks[check.key];
            const passed = count === 0;
            const related = passed
              ? []
              : warnings.filter((w) => w.type === check.warningType).map(({ type: _type, message: _msg, ...rest }) => rest);
            return (
              <tr key={check.key} class="endpoint-row">
                <td style={{ width: '2em', textAlign: 'center', fontSize: '1.1em' }}>
                  {passed ? <span class="status-success">{'\u2713'}</span> : <span class="status-warning">{'\u26A0'}</span>}
                </td>
                <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{check.label}</td>
                <td style={{ width: '100%' }} class={passed ? undefined : 'status-warning'}>
                  {passed ? (
                    'All recognized'
                  ) : (
                    <>
                      {`${count} unknown`}
                      <pre class="debug-snippet">{JSON.stringify(related.slice(0, 10), null, 2)}</pre>
                      {related.length > 10 && <p style={{ margin: 0, fontSize: '0.85em' }}>{`\u2026and ${related.length - 10} more`}</p>}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasIssues && (
        <p class="note-text">Unknown types require an app update to resolve. Contact support if this persists after updating.</p>
      )}
    </div>
  );
}

// ============================================================================
// SYNC STATUS SECTION
// ============================================================================

interface SyncStatusSectionProps {
  syncState: SyncState;
  boothFinderEnabled: boolean;
  autoSync: boolean;
  boothAutoRefresh: boolean;
  onSyncReports: () => void;
  onRefreshBooths: () => void;
  onToggleAutoSync: (enabled: boolean) => void;
  onToggleAutoRefreshBooths: (enabled: boolean) => void;
  readOnly: boolean;
}

export function SyncStatusSection({
  syncState,
  boothFinderEnabled,
  autoSync,
  boothAutoRefresh,
  onSyncReports,
  onRefreshBooths,
  onToggleAutoSync,
  onToggleAutoRefreshBooths,
  readOnly
}: SyncStatusSectionProps) {
  return (
    <div>
      <h3>Sync Status</h3>
      <EndpointGroupTable
        endpoints={syncState.endpoints}
        group="reports"
        label="Reports"
        showFrequency={false}
        onRefresh={onSyncReports}
        refreshing={syncState.syncing}
        readOnly={readOnly}
        autoEnabled={autoSync}
        onToggleAuto={onToggleAutoSync}
      />
      {boothFinderEnabled && (
        <EndpointGroupTable
          endpoints={syncState.endpoints}
          group="booth-availability"
          label="Booth Finder"
          showFrequency={false}
          onRefresh={onRefreshBooths}
          refreshing={syncState.refreshingBooths}
          readOnly={readOnly}
          autoEnabled={boothAutoRefresh}
          onToggleAuto={onToggleAutoRefreshBooths}
        />
      )}
    </div>
  );
}
