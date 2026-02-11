// Data Store — Plain data container for reconciled cookie data
// No methods, no behavior — just typed state.

import type {
  Allocation,
  BoothLocation,
  BoothReservationImported,
  Order,
  RawScoutData,
  ReconcilerMetadata,
  Transfer,
  UnifiedDataset
} from './types';

export interface DataStore {
  orders: Map<string, Order>;
  transfers: Transfer[];
  scouts: Map<string, RawScoutData>;
  troopNumber: string | null;
  allocations: Allocation[];
  boothReservations: BoothReservationImported[];
  boothLocations: BoothLocation[];
  virtualCookieShareAllocations: Map<number, number>;
  boothCookieShareAllocations: Map<number, number>;
  metadata: ReconcilerMetadata;
  unified: UnifiedDataset | null;
}

export function createDataStore(): DataStore {
  return {
    orders: new Map(),
    transfers: [],
    scouts: new Map(),
    troopNumber: null,
    allocations: [],
    boothReservations: [],
    boothLocations: [],
    virtualCookieShareAllocations: new Map(),
    boothCookieShareAllocations: new Map(),
    metadata: {
      lastImportDC: null,
      lastImportSC: null,
      cookieIdMap: null,
      sources: [],
      warnings: []
    },
    unified: null
  };
}
