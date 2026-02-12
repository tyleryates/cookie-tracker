import type { Scout } from '../../types';

export function makeScout(name: string, girlId?: number): Scout {
  return {
    name,
    girlId,
    isSiteOrder: false,
    orders: [],
    inventory: { total: 0, varieties: {} },
    allocations: [],
    $allocationsByChannel: { booth: [], directShip: [], virtualBooth: [] },
    totals: {
      orders: 0,
      delivered: 0,
      shipped: 0,
      donations: 0,
      credited: 0,
      totalSold: 0,
      inventory: 0,
      $financials: { cashCollected: 0, electronicPayments: 0, inventoryValue: 0, unsoldValue: 0, cashOwed: 0 },
      $inventoryDisplay: {},
      $salesByVariety: {},
      $shippedByVariety: {},
      $allocationSummary: {
        booth: { packages: 0, donations: 0, varieties: {} },
        directShip: { packages: 0, donations: 0, varieties: {} },
        virtualBooth: { packages: 0, donations: 0, varieties: {} }
      },
      $orderStatusCounts: { needsApproval: 0, pending: 0, completed: 0 }
    }
  };
}
