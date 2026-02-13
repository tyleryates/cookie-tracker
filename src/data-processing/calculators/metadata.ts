// Metadata Builder
// Builds unified metadata with health checks and statistics

import type { ReadonlyDataStore } from '../../data-store';
import type { HealthChecks, Scout, UnifiedMetadata, Warning } from '../../types';

/** Build unified metadata with health checks */
function buildUnifiedMetadata(store: ReadonlyDataStore, warnings: Warning[] = [], scouts: Record<string, Scout>): UnifiedMetadata {
  const healthChecks: HealthChecks = {
    warningsCount: warnings.length,
    unknownOrderTypes: warnings.filter((w) => w.type === 'UNKNOWN_ORDER_TYPE').length,
    unknownPaymentMethods: warnings.filter((w) => w.type === 'UNKNOWN_PAYMENT_METHOD').length,
    unknownTransferTypes: warnings.filter((w) => w.type === 'UNKNOWN_TRANSFER_TYPE').length,
    unknownCookieIds: warnings.filter((w) => w.type === 'UNKNOWN_COOKIE_ID').length
  };

  return {
    lastImportDC: store.metadata.lastImportDC,
    lastImportSC: store.metadata.lastImportSC,
    lastImportSCReport: store.metadata.lastImportSCReport,
    cookieIdMap: store.metadata.cookieIdMap,
    sources: store.metadata.sources,
    unifiedBuildTime: new Date().toISOString(),
    scoutCount: Object.keys(scouts).length,
    orderCount: Object.values(scouts).reduce((sum: number, s: Scout) => sum + s.orders.length, 0),
    healthChecks
  };
}

export { buildUnifiedMetadata };
