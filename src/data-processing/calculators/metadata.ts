// Metadata Builder
// Builds unified metadata with health checks and statistics

import type { DataStore } from '../../data-store';
import type { HealthChecks, Scout, UnifiedMetadata, Warning } from '../../types';

/** Build unified metadata with health checks */
export function buildUnifiedMetadata(reconciler: DataStore, warnings: Warning[] = [], scouts: Map<string, Scout>): UnifiedMetadata {
  const healthChecks: HealthChecks = {
    warningsCount: warnings.length,
    unknownOrderTypes: warnings.filter((w) => w.type === 'UNKNOWN_ORDER_TYPE').length,
    unknownPaymentMethods: warnings.filter((w) => w.type === 'UNKNOWN_PAYMENT_METHOD').length,
    unknownTransferTypes: warnings.filter((w) => w.type === 'UNKNOWN_TRANSFER_TYPE').length
  };

  return {
    lastImportDC: reconciler.metadata.lastImportDC,
    lastImportSC: reconciler.metadata.lastImportSC,
    lastImportSCReport: reconciler.metadata.lastImportSCReport,
    cookieIdMap: reconciler.metadata.cookieIdMap,
    sources: reconciler.metadata.sources,
    unifiedBuildTime: new Date().toISOString(),
    scoutCount: scouts.size,
    orderCount: Array.from(scouts.values()).reduce((sum: number, s: Scout) => sum + s.orders.length, 0),
    healthChecks
  };
}
