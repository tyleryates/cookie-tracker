// Debug Mutations — Injects conditions that trigger every warning/alert state
// Applied to a mutable DataStore between import and build phases.
// No files are modified on disk — resync restores clean state.
//
// Each mutation first tries to mutate existing data. If the prerequisite data
// doesn't exist, it injects synthetic records so every warning fires regardless
// of what's in the actual dataset.

import { ALLOCATION_CHANNEL, DC_COLUMNS, DC_PAYMENT_STATUS, ORDER_TYPE, OWNER, SPECIAL_IDENTIFIERS, TRANSFER_CATEGORY } from './constants';
import type { DataStore } from './data-store';
import Logger from './logger';
import type { BoothLocation, Transfer } from './types';

/** Get a real scout name from the store, or a fallback */
function anyScoutName(store: DataStore): string {
  for (const order of store.orders.values()) {
    if (order.owner === OWNER.GIRL && order.scout) return order.scout;
  }
  for (const row of store.rawDCData) {
    const last = row[DC_COLUMNS.GIRL_LAST_NAME] || '';
    if (last && last !== SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME) {
      return `${row[DC_COLUMNS.GIRL_FIRST_NAME] || ''} ${last}`.trim();
    }
  }
  return 'Debug Scout';
}

/** Get a site scout name (e.g. "Troop3990 Site") from existing data, or build one */
function siteScoutName(store: DataStore): string {
  for (const row of store.rawDCData) {
    if ((row[DC_COLUMNS.GIRL_LAST_NAME] || '') === SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME) {
      return `${row[DC_COLUMNS.GIRL_FIRST_NAME] || ''} ${SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME}`.trim();
    }
  }
  const troopNum = store.troopNumber || '0000';
  return `${SPECIAL_IDENTIFIERS.TROOP_FIRSTNAME_PREFIX}${troopNum} ${SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME}`;
}

/** Build a synthetic DC row for injection */
function makeDCRow(
  store: DataStore,
  orderNum: string,
  opts: { site?: boolean; orderType?: string; packages?: string; amount?: string; status?: string; payment?: string; donation?: string }
) {
  const name = opts.site ? siteScoutName(store) : anyScoutName(store);
  const parts = name.split(' ');
  return {
    [DC_COLUMNS.ORDER_NUMBER]: orderNum,
    [DC_COLUMNS.GIRL_FIRST_NAME]: parts[0] || (opts.site ? 'TroopDebug' : 'Debug'),
    [DC_COLUMNS.GIRL_LAST_NAME]: opts.site ? SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME : parts.slice(1).join(' ') || 'Scout',
    [DC_COLUMNS.ORDER_DATE]: TODAY,
    [DC_COLUMNS.ORDER_TYPE]: opts.orderType ?? 'In-Person Delivery',
    [DC_COLUMNS.TOTAL_PACKAGES]: opts.packages ?? '2',
    [DC_COLUMNS.REFUNDED_PACKAGES]: '0',
    [DC_COLUMNS.CURRENT_SALE_AMOUNT]: opts.amount ?? '12',
    [DC_COLUMNS.ORDER_STATUS]: opts.status ?? 'Completed',
    [DC_COLUMNS.PAYMENT_STATUS]: opts.payment ?? DC_PAYMENT_STATUS.CASH,
    [DC_COLUMNS.DONATION]: opts.donation ?? '0'
  };
}

const TODAY = new Date().toISOString().slice(0, 10);

function log(msg: string): void {
  Logger.debug(`[Debug] ${msg}`);
}

/** 1. Inject Needs Approval + Pending order statuses → red/yellow pills in Scout Inventory detail */
function mutateOrderStatuses(store: DataStore): number {
  let n = 0;
  let setNA = false;
  let setPending = false;

  for (const order of store.orders.values()) {
    if (order.owner !== OWNER.GIRL) continue;
    if (order.orderType !== ORDER_TYPE.DELIVERY && order.orderType !== ORDER_TYPE.IN_HAND) continue;
    if (!order.status?.includes('Completed') && !order.status?.includes('Delivered')) continue;

    if (!setNA) {
      order.status = 'Needs Approval for Delivery';
      setNA = true;
      n++;
      log(`Set order ${order.orderNumber} → "Needs Approval for Delivery"`);
      continue;
    }
    if (!setPending) {
      order.status = 'Approved for Delivery';
      setPending = true;
      n++;
      log(`Set order ${order.orderNumber} → "Approved for Delivery"`);
      break;
    }
  }

  if (!setNA) {
    store.rawDCData.push(makeDCRow(store, 'DEBUG-NA-001', { status: 'Needs Approval for Delivery' }));
    n++;
    log('Injected synthetic "Needs Approval" DC order');
  }
  if (!setPending) {
    store.rawDCData.push(makeDCRow(store, 'DEBUG-PD-001', { status: 'Approved for Delivery' }));
    n++;
    log('Injected synthetic "Pending" DC order');
  }
  return n;
}

/** 2. Create negative scout inventory → alert badge, warning box + red cells */
function mutateNegativeInventory(store: DataStore): number {
  for (const transfer of store.transfers) {
    if (transfer.category !== TRANSFER_CATEGORY.GIRL_PICKUP) continue;
    if (transfer.physicalPackages <= 0) continue;

    const firstVariety = Object.keys(transfer.varieties)[0] as keyof typeof transfer.varieties | undefined;
    if (!firstVariety || !transfer.varieties[firstVariety]) continue;

    const removed = transfer.varieties[firstVariety]!;
    transfer.varieties[firstVariety] = 0;
    transfer.packages -= removed;
    transfer.physicalPackages -= removed;
    if (transfer.physicalVarieties[firstVariety]) {
      transfer.physicalVarieties[firstVariety] = 0;
    }
    log(`Zeroed ${firstVariety} (${removed} pkgs) on T2G transfer to ${transfer.to}`);
    return 1;
  }

  store.rawDCData.push(makeDCRow(store, 'DEBUG-NEG-001', { packages: '5', amount: '30' }));
  log('Injected synthetic order to create negative inventory');
  return 1;
}

/** 3. Inject unknown transfer type → health check warning */
function mutateUnknownTransferType(store: DataStore): number {
  const fakeTransfer: Transfer = {
    type: 'XYZZY' as Transfer['type'],
    category: TRANSFER_CATEGORY.GIRL_PICKUP as Transfer['category'],
    date: TODAY,
    from: 'Debug Troop',
    to: 'Debug Scout',
    packages: 0,
    physicalPackages: 0,
    cases: 0,
    varieties: {},
    physicalVarieties: {}
  };
  store.transfers.push(fakeTransfer);
  log('Pushed transfer with unknown type "XYZZY"');
  return 1;
}

/** 4. Inject unknown payment method → health check warning */
function mutateUnknownPayment(store: DataStore): number {
  for (const row of store.rawDCData) {
    if (row[DC_COLUMNS.PAYMENT_STATUS]) {
      row[DC_COLUMNS.PAYMENT_STATUS] = 'BITCOIN';
      log(`Changed Payment Status → "BITCOIN" on order ${row[DC_COLUMNS.ORDER_NUMBER]}`);
      return 1;
    }
  }
  store.rawDCData.push(makeDCRow(store, 'DEBUG-PAY-001', { packages: '1', amount: '6', payment: 'BITCOIN' }));
  log('Injected synthetic DC row with payment "BITCOIN"');
  return 1;
}

/** 5. Unallocated Troop Girl Delivery → alert + info box on Troop Online Orders */
function mutateUnallocatedGirlDelivery(store: DataStore): number {
  for (let i = store.transfers.length - 1; i >= 0; i--) {
    if (store.transfers[i].category === TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION) {
      log(`Removed VIRTUAL_BOOTH_ALLOCATION transfer to ${store.transfers[i].to}`);
      store.transfers.splice(i, 1);
      return 1;
    }
  }
  store.rawDCData.push(makeDCRow(store, 'DEBUG-GD-001', { site: true, packages: '3', amount: '18', payment: DC_PAYMENT_STATUS.CAPTURED }));
  log('Injected synthetic site DELIVERY order (unallocated girl delivery)');
  return 1;
}

/** 6. Unallocated Troop Direct Ship → alert */
function mutateUnallocatedDirectShip(store: DataStore): number {
  for (let i = store.allocations.length - 1; i >= 0; i--) {
    if (store.allocations[i].channel === ALLOCATION_CHANNEL.DIRECT_SHIP) {
      log(`Removed DIRECT_SHIP allocation for girl ${store.allocations[i].girlId}`);
      store.allocations.splice(i, 1);
      return 1;
    }
  }
  store.rawDCData.push(
    makeDCRow(store, 'DEBUG-DS-001', {
      site: true,
      orderType: 'Shipped by Girl Scouts',
      status: 'Shipped',
      payment: DC_PAYMENT_STATUS.CAPTURED
    })
  );
  log('Injected synthetic site DIRECT_SHIP order (unallocated direct ship)');
  return 1;
}

/** 7. Unallocated Booth Sale → alert + warning on Completed Booths */
function mutateUnallocatedBoothSale(store: DataStore): number {
  for (let i = store.allocations.length - 1; i >= 0; i--) {
    if (store.allocations[i].channel === ALLOCATION_CHANNEL.BOOTH) {
      log(`Removed BOOTH allocation for girl ${store.allocations[i].girlId}`);
      store.allocations.splice(i, 1);
      return 1;
    }
  }
  store.rawDCData.push(makeDCRow(store, 'DEBUG-BS-001', { site: true, orderType: 'Cookies in Hand', packages: '4', amount: '24' }));
  log('Injected synthetic site BOOTH order (unallocated booth sale)');
  return 1;
}

/** 8. Booth needs distribution → alert + "Needs Distribution" pill */
function mutateBoothNeedsDistribution(store: DataStore): number {
  for (const res of store.boothReservations) {
    if (res.booth.reservationType?.toLowerCase().includes('virtual')) continue;
    if (res.booth.isDistributed) {
      res.booth.isDistributed = false;
      log(`Set isDistributed=false on booth "${res.booth.storeName}"`);
      return 1;
    }
  }

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  store.boothReservations.push({
    id: 'DEBUG-BOOTH-001',
    troopId: store.troopNumber || '0000',
    booth: {
      boothId: 'debug-booth',
      storeName: 'Debug Store',
      address: '123 Debug St',
      reservationType: 'FCFS',
      isDistributed: false,
      isVirtuallyDistributed: false
    },
    timeslot: { date: yesterday, startTime: '10:00', endTime: '14:00' },
    cookies: { THIN_MINTS: 5 },
    totalPackages: 5,
    physicalPackages: 5,
    trackedCookieShare: 0
  });
  log('Injected synthetic past booth reservation (needs distribution)');
  return 1;
}

/** 9. Donations need adjustment → alert + adjustment rows on Donations report */
function mutateDonationReconciliation(store: DataStore): number {
  let n = 0;

  // 10a. Reduce a virtualCookieShareAllocations entry → per-scout adjustment becomes non-zero
  let reducedVCS = false;
  for (const [girlId, count] of store.virtualCookieShareAllocations) {
    if (count > 0) {
      store.virtualCookieShareAllocations.set(girlId, 0);
      reducedVCS = true;
      n++;
      log(`Zeroed virtualCookieShareAllocations for girlId ${girlId} (was ${count})`);
      break;
    }
  }

  // 10b. Zero a COOKIE_SHARE_RECORD transfer → global reconciliation fails
  let adjustedDonation = false;
  for (const transfer of store.transfers) {
    if (transfer.category !== TRANSFER_CATEGORY.COOKIE_SHARE_RECORD) continue;
    if (String(transfer.orderNumber || '').startsWith(SPECIAL_IDENTIFIERS.DC_ORDER_PREFIX)) continue;
    if (Math.abs(transfer.packages || 0) > 0) {
      const original = transfer.packages;
      transfer.packages = 0;
      adjustedDonation = true;
      n++;
      log(`Zeroed COOKIE_SHARE_RECORD packages (was ${original}) on order ${transfer.orderNumber}`);
      break;
    }
  }

  // Fallback: if neither source had data, inject a DC order with manual donations and no SC match
  if (!adjustedDonation && !reducedVCS) {
    store.rawDCData.push(makeDCRow(store, 'DEBUG-DON-001', { packages: '3', amount: '18', donation: '2' }));
    n++;
    log('Injected synthetic DC order with 2 manual-entry donations (no SC match)');
  }
  return n;
}

/** 10. Available booth slots → slots appear in Available Booths report and tab badge count */
function mutateAvailableBooths(store: DataStore): number {
  const tomorrow = new Date(Date.now() + 86_400_000);
  const dayAfter = new Date(Date.now() + 2 * 86_400_000);
  const toDateStr = (d: Date) => d.toISOString().slice(0, 10);
  const fakeBooth: BoothLocation = {
    id: 99999,
    storeName: 'Debug Grocery (Fake Booth)',
    address: { street: '456 Test Ave', city: 'Testville', state: 'CA', zip: '90210', latitude: 34.09, longitude: -118.41 },
    reservationType: 'FCFS',
    notes: 'Injected by debug mutations',
    availableDates: [
      {
        date: toDateStr(tomorrow),
        timeSlots: [
          { startTime: '10:00', endTime: '14:00' },
          { startTime: '14:00', endTime: '18:00' }
        ]
      },
      { date: toDateStr(dayAfter), timeSlots: [{ startTime: '10:00', endTime: '14:00' }] }
    ]
  };
  store.boothLocations.push(fakeBooth);
  log(`Injected fake booth "${fakeBooth.storeName}" with 3 available slots`);
  return 1;
}

export function applyDebugMutations(store: DataStore): void {
  let n = 0;
  n += mutateOrderStatuses(store);
  n += mutateNegativeInventory(store);
  n += mutateUnknownTransferType(store);
  n += mutateUnknownPayment(store);
  n += mutateUnallocatedGirlDelivery(store);
  n += mutateUnallocatedDirectShip(store);
  n += mutateUnallocatedBoothSale(store);
  n += mutateBoothNeedsDistribution(store);
  n += mutateDonationReconciliation(store);
  n += mutateAvailableBooths(store);
  Logger.info(`[Debug] Applied ${n} debug mutations to DataStore`);
}
