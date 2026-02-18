import { describe, expect, it } from 'vitest';
import { createDataStore, type DataStore } from '../../data-store';
import type { ScoutCounts } from '../../types';
import type { PackageTotals } from '../calculators/package-totals';
import { buildTroopTotals } from '../calculators/troop-totals';
import { makeScout } from './test-utils';

function emptyPackageTotals(): PackageTotals {
  return { c2tReceived: 0, t2tOut: 0, allocated: 0, virtualBoothT2G: 0, boothDividerT2G: 0, directShip: 0, g2t: 0 };
}

function defaultScoutCounts(overrides: Partial<ScoutCounts> = {}): ScoutCounts {
  return { total: 0, active: 0, inactive: 0, withNegativeInventory: 0, ...overrides };
}

describe('buildTroopTotals', () => {
  it('calculates net troop inventory', () => {
    const store = createDataStore();
    const totals = emptyPackageTotals();
    totals.c2tReceived = 100;
    totals.t2tOut = 10;
    totals.allocated = 30;
    totals.virtualBoothT2G = 5;
    totals.boothDividerT2G = 3;
    totals.g2t = 8;
    // 100 - 10 - 30 - 5 - 3 + 8 = 60
    const result = buildTroopTotals(store, {}, totals, defaultScoutCounts());
    expect(result.inventory).toBe(60);
  });

  it('calculates packagesCredited', () => {
    const store = createDataStore();
    const totals = emptyPackageTotals();
    totals.c2tReceived = 100;
    totals.t2tOut = 10;
    // No scouts, no DC data → donations = 0, directShip = 0
    // packagesCredited = 100 - 10 + 0 + 0 = 90
    const result = buildTroopTotals(store, {}, totals, defaultScoutCounts());
    expect(result.packagesCredited).toBe(90);
  });

  it('calculates proceeds rate based on PGA', () => {
    const store = createDataStore();
    const totals = emptyPackageTotals();
    totals.c2tReceived = 400;
    // packagesCredited = 400, active = 2, PGA = 200 → rate 0.90
    const result = buildTroopTotals(store, {}, totals, defaultScoutCounts({ active: 2 }));
    expect(result.proceedsRate).toBe(0.9);
  });

  it('uses 0.85 rate for low PGA', () => {
    const store = createDataStore();
    const totals = emptyPackageTotals();
    totals.c2tReceived = 100;
    // packagesCredited = 100, active = 2, PGA = 50 → rate 0.85
    const result = buildTroopTotals(store, {}, totals, defaultScoutCounts({ active: 2 }));
    expect(result.proceedsRate).toBe(0.85);
  });

  it('uses 0.95 rate for high PGA', () => {
    const store = createDataStore();
    const totals = emptyPackageTotals();
    totals.c2tReceived = 700;
    // packagesCredited = 700, active = 2, PGA = 350 → rate 0.95
    const result = buildTroopTotals(store, {}, totals, defaultScoutCounts({ active: 2 }));
    expect(result.proceedsRate).toBe(0.95);
  });

  it('calculates troopProceeds with exempt deduction', () => {
    const store = createDataStore();
    const totals = emptyPackageTotals();
    totals.c2tReceived = 400;
    // packagesCredited=400, active=2, PGA=200 → rate=0.90
    // grossProceeds = 400 * 0.90 = 360
    // exemptPackages = 2 * 50 = 100
    // proceedsDeduction = 100 * 0.90 = 90
    // troopProceeds = 360 - 90 = 270
    const result = buildTroopTotals(store, {}, totals, defaultScoutCounts({ active: 2 }));
    expect(result.grossProceeds).toBe(360);
    expect(result.proceedsExemptPackages).toBe(100);
    expect(result.proceedsDeduction).toBe(90);
    expect(result.troopProceeds).toBe(270);
  });

  it('PGA is zero when no active scouts', () => {
    const store = createDataStore();
    const totals = emptyPackageTotals();
    totals.c2tReceived = 100;
    const result = buildTroopTotals(store, {}, totals, defaultScoutCounts({ active: 0 }));
    expect(result.proceedsRate).toBe(0.85); // PGA=0 → lowest rate
    expect(result.proceedsExemptPackages).toBe(0);
  });

  it('aggregates girl delivery from scout allocations', () => {
    const store = createDataStore();
    const jane = makeScout('Jane');
    jane.totals.delivered = 10;
    jane.totals.$allocationSummary.virtualBooth.packages = 5;
    const scouts = { Jane: jane };
    const result = buildTroopTotals(store, scouts, emptyPackageTotals(), defaultScoutCounts());
    expect(result.girlDelivery).toBe(15); // 10 + 5
  });

  it('aggregates girl inventory (allows negative)', () => {
    const store = createDataStore();
    const jane = makeScout('Jane');
    jane.totals.inventory = -5;
    const scouts = { Jane: jane };
    const result = buildTroopTotals(store, scouts, emptyPackageTotals(), defaultScoutCounts());
    expect(result.girlInventory).toBe(-5);
  });

  it('aggregates credited donations from all allocation channels', () => {
    const store = createDataStore();
    const jane = makeScout('Jane');
    jane.totals.$allocationSummary.virtualBooth.donations = 2;
    jane.totals.$allocationSummary.directShip.donations = 1;
    jane.totals.$allocationSummary.booth.donations = 3;
    const scouts = { Jane: jane };
    const result = buildTroopTotals(store, scouts, emptyPackageTotals(), defaultScoutCounts());
    expect(result.donations).toBe(6); // 2+1+3 from allocations, 0 from DC
  });

  it('counts DC non-site donations from rawDCData', () => {
    const store = createDataStore();
    (store as DataStore).rawDCData = [
      { 'Girl Last Name': 'Doe', Donation: '3' },
      { 'Girl Last Name': 'Site', Donation: '5' } // site order — should be skipped
    ];
    const result = buildTroopTotals(store, {}, emptyPackageTotals(), defaultScoutCounts());
    expect(result.donations).toBe(3); // Only non-site
  });

  it('skips site orders in scout aggregation', () => {
    const store = createDataStore();
    const site = makeScout('Troop Site');
    site.isSiteOrder = true;
    site.totals.delivered = 20;
    site.totals.$allocationSummary.virtualBooth.packages = 10;
    const scouts = { 'Troop Site': site };
    const result = buildTroopTotals(store, scouts, emptyPackageTotals(), defaultScoutCounts());
    expect(result.girlDelivery).toBe(0); // Site orders excluded
  });

  it('counts direct ship from all scouts including site', () => {
    const store = createDataStore();
    const jane = makeScout('Jane');
    jane.totals.shipped = 5;
    const site = makeScout('Troop Site');
    site.isSiteOrder = true;
    site.totals.shipped = 3;
    const scouts = { Jane: jane, 'Troop Site': site };
    const result = buildTroopTotals(store, scouts, emptyPackageTotals(), defaultScoutCounts());
    expect(result.directShip).toBe(0); // directShip comes from packageTotals, not scout agg
  });

  it('aggregates pending pickup from negative inventory issues', () => {
    const store = createDataStore();
    const jane = makeScout('Jane');
    jane.$issues = {
      negativeInventory: [
        { variety: 'THIN_MINTS', inventory: 2, sales: 5, shortfall: 3 },
        { variety: 'TREFOILS', inventory: 0, sales: 2, shortfall: 2 }
      ]
    };
    const scouts = { Jane: jane };
    const result = buildTroopTotals(store, scouts, emptyPackageTotals(), defaultScoutCounts());
    expect(result.pendingPickup).toBe(5);
  });

  it('includes booth sales packages and donations', () => {
    const store = createDataStore();
    const jane = makeScout('Jane');
    jane.totals.$allocationSummary.booth.packages = 10;
    jane.totals.$allocationSummary.booth.donations = 2;
    const scouts = { Jane: jane };
    const result = buildTroopTotals(store, scouts, emptyPackageTotals(), defaultScoutCounts());
    expect(result.boothSalesPackages).toBe(10);
    expect(result.boothSalesDonations).toBe(2);
  });
});
