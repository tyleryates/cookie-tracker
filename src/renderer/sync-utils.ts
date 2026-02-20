// Sync state utilities — pure functions for sync state management

import { SYNC_ENDPOINTS } from '../constants';
import type { EndpointSyncState, SyncState } from '../types';

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

    let status: OverallStatus;
    if (syncingCount > 0) status = 'syncing';
    else if (syncedCount === eps.length) status = 'synced';
    else if (errorCount > 0 && syncedCount === 0) status = 'error';
    else if (errorCount > 0 || syncedCount > 0) status = 'partial';
    else status = 'idle';

    return { status, lastSync };
  }

  const reports = compute('reports');
  const booths = compute('booth-availability');

  // Override: if the top-level syncing flag is on AND some endpoints in the group
  // haven't resolved yet, force 'syncing' to prevent flicker when one platform
  // finishes before the other starts. Once all group endpoints are resolved
  // (synced/error), stop overriding so the group reflects its true status even if
  // other groups (e.g. booth availability) are still in-flight.
  const isResolved = (s: OverallStatus) => s === 'synced' || s === 'error' || s === 'partial';
  if (syncFlags?.syncing && !isResolved(reports.status)) {
    reports.status = 'syncing';
  }
  if (syncFlags?.refreshingBooths && !isResolved(booths.status)) {
    booths.status = 'syncing';
  }

  return { reports, booths };
}
