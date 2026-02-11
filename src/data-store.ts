// Data Store — Plain data container and factory for reconciled cookie data

import type { Allocation, BoothLocation, BoothReservationImported, Order, RawScoutData, ReconcilerMetadata, Transfer } from './types';

export interface DataStore {
  orders: Map<string, Order>;
  transfers: Transfer[];
  scouts: Map<string, RawScoutData>;
  troopNumber: string | null;
  allocations: Allocation[];
  boothReservations: BoothReservationImported[];
  boothLocations: BoothLocation[];
  virtualCookieShareAllocations: Map<number, number>;
  metadata: ReconcilerMetadata;
}

export type ReadonlyDataStore = Readonly<DataStore>;

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
    metadata: {
      lastImportDC: null,
      lastImportSC: null,
      cookieIdMap: null,
      sources: [],
      warnings: []
    }
  };
}
