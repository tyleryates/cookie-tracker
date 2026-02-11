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
  boothSalesAllocations: BoothSalesAllocation[] | null;
  boothReservations: BoothReservationImported[] | null;
  boothLocations: BoothLocation[] | null;
  directShipAllocations: DirectShipAllocation[] | null;
  virtualCookieShareAllocations: Map<number, number> | null;
  boothCookieShareAllocations: Map<number, number> | null;
  metadata: ReconcilerMetadata;
  unified: UnifiedDataset | null;
}

export function createDataStore(): DataStore {
  return {
    orders: new Map(),
    transfers: [],
    scouts: new Map(),
    troopNumber: null,
    boothSalesAllocations: null,
    boothReservations: null,
    boothLocations: null,
    directShipAllocations: null,
    virtualCookieShareAllocations: null,
    boothCookieShareAllocations: null,
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
