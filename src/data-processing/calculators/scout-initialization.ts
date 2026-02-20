// Scout Initialization
// Creates initial scout data structures from DC and SC data

import { DC_COLUMNS, SPECIAL_IDENTIFIERS } from '../../constants';
import type { ReadonlyDataStore } from '../../data-store';
import type { RawDataRow, Scout } from '../../types';
import { buildScoutName } from '../utils';

/** Initialize scouts from Digital Cookie and Smart Cookie data */
function initializeScouts(store: ReadonlyDataStore, rawDCData: RawDataRow[]): Map<string, Scout> {
  const scoutDataset = new Map<string, Scout>();

  // From Digital Cookie orders
  for (const row of rawDCData) {
    const firstName = row[DC_COLUMNS.GIRL_FIRST_NAME] || '';
    const lastName = row[DC_COLUMNS.GIRL_LAST_NAME] || '';
    const name = buildScoutName(String(firstName), String(lastName));

    if (!scoutDataset.has(name)) {
      const isSiteOrder = lastName === SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME;
      scoutDataset.set(name, createScoutStructure(name, null, isSiteOrder));
    }
  }

  // Add scouts from Smart Cookie data (may have scouts without DC orders)
  for (const [scoutName, scoutData] of store.scouts) {
    if (!scoutDataset.has(scoutName)) {
      scoutDataset.set(scoutName, createScoutStructure(scoutName, scoutData.scoutId || null, false));
    } else {
      // Update girlId if we have it from SC
      const scout = scoutDataset.get(scoutName)!;
      if (scoutData.scoutId && !scout.girlId) {
        scout.girlId = scoutData.scoutId;
      }
    }
  }

  // Attach finance payments to scouts
  for (const [scoutName, payments] of store.financePayments) {
    const scout = scoutDataset.get(scoutName);
    if (scout) {
      scout.payments = payments;
    }
  }

  return scoutDataset;
}

/** Create empty scout data structure */
function createScoutStructure(name: string, girlId: number | null, isSiteOrder: boolean): Scout {
  return {
    // Identity
    name: name,
    girlId: girlId ?? undefined,
    isSiteOrder: isSiteOrder,

    // Orders (classified)
    orders: [],
    payments: [],

    // Inventory
    inventory: {
      total: 0,
      varieties: {}
    },

    // Flat allocation list (booth, directShip, virtualBooth)
    allocations: [],
    $allocationsByChannel: { booth: [], directShip: [], virtualBooth: [] },

    // Totals (calculated later)
    totals: {
      orders: 0,
      delivered: 0, // Physical packages for girl delivery
      shipped: 0, // Scout's own direct ship orders
      credited: 0, // Virtual booth + direct ship + booth sales allocations
      donations: 0, // Cookie Share
      totalSold: 0, // All packages sold
      inventory: 0, // Net inventory
      $financials: {
        cashCollected: 0,
        electronicPayments: 0,
        inventoryValue: 0,
        unsoldValue: 0,
        cashOwed: 0,
        paymentsTurnedIn: 0,
        cashDue: 0
      },
      $inventoryDisplay: {}, // Net inventory by variety
      $salesByVariety: {},
      $allocationSummary: {
        booth: { packages: 0, donations: 0, varieties: {} },
        directShip: { packages: 0, donations: 0, varieties: {} },
        virtualBooth: { packages: 0, donations: 0, varieties: {} }
      },
      $orderStatusCounts: { needsApproval: 0, pending: 0, completed: 0 }
    }
  };
}

export { initializeScouts };
