// Data Store — Plain data container and factory for reconciled cookie data

import type {
  Allocation,
  BoothLocation,
  BoothReservationImported,
  DataStoreMetadata,
  FinancePayment,
  Order,
  RawDataRow,
  RawScoutData,
  Transfer
} from './types';

export interface DataStore {
  orders: Map<string, Order>;
  transfers: Transfer[];
  scouts: Map<string, RawScoutData>;
  troopNumber: string | null;
  troopName: string | null;
  allocations: Allocation[];
  boothReservations: BoothReservationImported[];
  boothLocations: BoothLocation[];
  financePayments: Map<string, FinancePayment[]>;
  virtualCookieShareAllocations: Map<number, number>;
  rawDCData: RawDataRow[];
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
    financePayments: new Map(),
    virtualCookieShareAllocations: new Map(),
    rawDCData: [],
    metadata: {
      lastImportDC: null,
      lastImportSC: null,
      cookieIdMap: null,
      sources: [],
      warnings: []
    }
  };
}
