// Data Store — Plain data container and factory for reconciled cookie data

import type { Allocation, BoothLocation, BoothReservationImported, DataStoreMetadata, Order, RawScoutData, Transfer } from './types';

export interface DataStore {
  orders: Map<string, Order>;
  transfers: Transfer[];
  scouts: Map<string, RawScoutData>;
  troopNumber: string | null;
  troopName: string | null;
  allocations: Allocation[];
  boothReservations: BoothReservationImported[];
  boothLocations: BoothLocation[];
  virtualCookieShareAllocations: Map<number, number>;
  metadata: DataStoreMetadata;
}

export type ReadonlyDataStore = Readonly<DataStore>;

export function createDataStore(): DataStore {
  return {
    orders: new Map(),
    transfers: [],
    scouts: new Map(),
    troopNumber: null,
    troopName: null,
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
