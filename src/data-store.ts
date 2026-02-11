// Data Store — Plain data container for reconciled cookie data
// No methods, no behavior — just typed state.

import type {
  BoothLocation,
  BoothReservationImported,
  BoothSalesAllocation,
  DirectShipAllocation,
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
  boothSalesAllocations: BoothSalesAllocation[];
  boothReservations: BoothReservationImported[];
  boothLocations: BoothLocation[];
  directShipAllocations: DirectShipAllocation[];
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
    boothSalesAllocations: [],
    boothReservations: [],
    boothLocations: [],
    directShipAllocations: [],
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
