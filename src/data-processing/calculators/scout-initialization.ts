// Scout Initialization
// Creates initial scout data structures from DC and SC data

import { DC_COLUMNS, SPECIAL_IDENTIFIERS } from '../../constants';
import type { DataStore } from '../../data-store';
import type { RawScoutData, Scout } from '../../types';

/** Initialize scouts from Digital Cookie and Smart Cookie data */
function initializeScouts(reconciler: DataStore, rawDCData: Record<string, any>[]): Map<string, Scout> {
  const scoutDataset = new Map();

  // From Digital Cookie orders
  rawDCData.forEach((row: Record<string, any>) => {
    const firstName = row[DC_COLUMNS.GIRL_FIRST_NAME] || '';
    const lastName = row[DC_COLUMNS.GIRL_LAST_NAME] || '';
    const name = `${firstName} ${lastName}`.trim();

    if (!scoutDataset.has(name)) {
      const isSiteOrder = lastName === SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME;
      scoutDataset.set(name, createScoutStructure(name, firstName, lastName, null, isSiteOrder));
    }
  });

  // Add scouts from Smart Cookie data (may have scouts without DC orders)
  reconciler.scouts.forEach((scoutData: RawScoutData, scoutName: string) => {
    if (!scoutDataset.has(scoutName)) {
      const nameParts = scoutName.split(' ');
      const lastName = nameParts[nameParts.length - 1];
      const firstName = nameParts.slice(0, -1).join(' ');

      scoutDataset.set(scoutName, createScoutStructure(scoutName, firstName, lastName, scoutData.scoutId || null, false));
    } else {
      // Update girlId if we have it from SC
      const scout = scoutDataset.get(scoutName);
      if (scoutData.scoutId && !scout.girlId) {
        scout.girlId = scoutData.scoutId;
      }
    }
  });

  return scoutDataset;
}

/** Create empty scout data structure */
function createScoutStructure(name: string, firstName: string, lastName: string, girlId: number | null, isSiteOrder: boolean): Scout {
  return {
    // Identity
    name: name,
    firstName: firstName,
    lastName: lastName,
    girlId: girlId ?? undefined,
    isSiteOrder: isSiteOrder,

    // Orders (classified)
    orders: [],

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
        cashOwed: 0
      },
      $inventoryDisplay: {}, // Net inventory by variety
      $salesByVariety: {},
      $shippedByVariety: {},
      $allocationSummary: {
        booth: { packages: 0, donations: 0, varieties: {} },
        directShip: { packages: 0, donations: 0, varieties: {} },
        virtualBooth: { packages: 0, donations: 0, varieties: {} }
      }
    }
  };
}

export { initializeScouts };
