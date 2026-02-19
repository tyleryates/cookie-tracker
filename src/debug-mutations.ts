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
import type { Transfer } from './types';

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

const TODAY = new Date().toISOString().slice(0, 10);

function log(msg: string): void {
  Logger.debug(`[Debug] ${msg}`);
}

export function applyDebugMutations(store: DataStore): void {
  let n = 0;

  // =========================================================================
  // 1. Needs Approval + Pending order statuses
  //    → Red/yellow pills in Scout Inventory detail
  // =========================================================================
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

  // Fallback: inject synthetic DC rows that the build will classify as DELIVERY with the right status
  if (!setNA) {
    const scout = anyScoutName(store);
    const parts = scout.split(' ');
    store.rawDCData.push({
      [DC_COLUMNS.ORDER_NUMBER]: 'DEBUG-NA-001',
      [DC_COLUMNS.GIRL_FIRST_NAME]: parts[0] || 'Debug',
      [DC_COLUMNS.GIRL_LAST_NAME]: parts.slice(1).join(' ') || 'Scout',
      [DC_COLUMNS.ORDER_DATE]: TODAY,
      [DC_COLUMNS.ORDER_TYPE]: 'In-Person Delivery',
      [DC_COLUMNS.TOTAL_PACKAGES]: '2',
      [DC_COLUMNS.REFUNDED_PACKAGES]: '0',
      [DC_COLUMNS.CURRENT_SALE_AMOUNT]: '12',
      [DC_COLUMNS.ORDER_STATUS]: 'Needs Approval for Delivery',
      [DC_COLUMNS.PAYMENT_STATUS]: DC_PAYMENT_STATUS.CASH,
      [DC_COLUMNS.DONATION]: '0'
    });
    n++;
    log('Injected synthetic "Needs Approval" DC order');
  }
  if (!setPending) {
    const scout = anyScoutName(store);
    const parts = scout.split(' ');
    store.rawDCData.push({
      [DC_COLUMNS.ORDER_NUMBER]: 'DEBUG-PD-001',
      [DC_COLUMNS.GIRL_FIRST_NAME]: parts[0] || 'Debug',
      [DC_COLUMNS.GIRL_LAST_NAME]: parts.slice(1).join(' ') || 'Scout',
      [DC_COLUMNS.ORDER_DATE]: TODAY,
      [DC_COLUMNS.ORDER_TYPE]: 'In-Person Delivery',
      [DC_COLUMNS.TOTAL_PACKAGES]: '2',
      [DC_COLUMNS.REFUNDED_PACKAGES]: '0',
      [DC_COLUMNS.CURRENT_SALE_AMOUNT]: '12',
      [DC_COLUMNS.ORDER_STATUS]: 'Approved for Delivery',
      [DC_COLUMNS.PAYMENT_STATUS]: DC_PAYMENT_STATUS.CASH,
      [DC_COLUMNS.DONATION]: '0'
    });
    n++;
    log('Injected synthetic "Pending" DC order');
  }

  // =========================================================================
  // 2. Negative scout inventory
  //    → "Scouts are missing cookies" alert badge, warning box + red cells
  // =========================================================================
  let zeroedTransfer = false;
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
    zeroedTransfer = true;
    n++;
    log(`Zeroed ${firstVariety} (${removed} pkgs) on T2G transfer to ${transfer.to}`);
    break;
  }

  if (!zeroedTransfer) {
    // Inject a DC order for a scout who has no T2G inventory → negative inventory
    const scout = anyScoutName(store);
    const parts = scout.split(' ');
    store.rawDCData.push({
      [DC_COLUMNS.ORDER_NUMBER]: 'DEBUG-NEG-001',
      [DC_COLUMNS.GIRL_FIRST_NAME]: parts[0] || 'Debug',
      [DC_COLUMNS.GIRL_LAST_NAME]: parts.slice(1).join(' ') || 'Scout',
      [DC_COLUMNS.ORDER_DATE]: TODAY,
      [DC_COLUMNS.ORDER_TYPE]: 'In-Person Delivery',
      [DC_COLUMNS.TOTAL_PACKAGES]: '5',
      [DC_COLUMNS.REFUNDED_PACKAGES]: '0',
      [DC_COLUMNS.CURRENT_SALE_AMOUNT]: '30',
      [DC_COLUMNS.ORDER_STATUS]: 'Completed',
      [DC_COLUMNS.PAYMENT_STATUS]: DC_PAYMENT_STATUS.CASH,
      [DC_COLUMNS.DONATION]: '0'
    });
    n++;
    log('Injected synthetic order to create negative inventory');
  }

  // =========================================================================
  // 3. Unknown transfer type
  //    → health check: unknownTransferTypes
  // =========================================================================
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
  n++;
  log('Pushed transfer with unknown type "XYZZY"');

  // =========================================================================
  // 4b. Unknown payment method
  //     → health check: unknownPaymentMethods
  // =========================================================================
  let changedPayment = false;
  for (const row of store.rawDCData) {
    if (row[DC_COLUMNS.PAYMENT_STATUS]) {
      row[DC_COLUMNS.PAYMENT_STATUS] = 'BITCOIN';
      changedPayment = true;
      n++;
      log(`Changed Payment Status → "BITCOIN" on order ${row[DC_COLUMNS.ORDER_NUMBER]}`);
      break;
    }
  }
  if (!changedPayment) {
    const scout = anyScoutName(store);
    const parts = scout.split(' ');
    store.rawDCData.push({
      [DC_COLUMNS.ORDER_NUMBER]: 'DEBUG-PAY-001',
      [DC_COLUMNS.GIRL_FIRST_NAME]: parts[0] || 'Debug',
      [DC_COLUMNS.GIRL_LAST_NAME]: parts.slice(1).join(' ') || 'Scout',
      [DC_COLUMNS.ORDER_DATE]: TODAY,
      [DC_COLUMNS.ORDER_TYPE]: 'In-Person Delivery',
      [DC_COLUMNS.TOTAL_PACKAGES]: '1',
      [DC_COLUMNS.REFUNDED_PACKAGES]: '0',
      [DC_COLUMNS.CURRENT_SALE_AMOUNT]: '6',
      [DC_COLUMNS.ORDER_STATUS]: 'Completed',
      [DC_COLUMNS.PAYMENT_STATUS]: 'BITCOIN',
      [DC_COLUMNS.DONATION]: '0'
    });
    n++;
    log('Injected synthetic DC row with payment "BITCOIN"');
  }

  // =========================================================================
  // 6. Unallocated Troop Girl Delivery
  //    → "Unallocated troop orders" alert, info box on Troop Online Orders
  //    girlDelivery.allocated comes from VIRTUAL_BOOTH_ALLOCATION transfers
  // =========================================================================
  let removedVB = false;
  for (let i = store.transfers.length - 1; i >= 0; i--) {
    if (store.transfers[i].category === TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION) {
      log(`Removed VIRTUAL_BOOTH_ALLOCATION transfer to ${store.transfers[i].to}`);
      store.transfers.splice(i, 1);
      removedVB = true;
      n++;
      break;
    }
  }
  if (!removedVB) {
    // No VB allocation to remove — inject a site DELIVERY order with no matching allocation
    const site = siteScoutName(store);
    const parts = site.split(' ');
    store.rawDCData.push({
      [DC_COLUMNS.ORDER_NUMBER]: 'DEBUG-GD-001',
      [DC_COLUMNS.GIRL_FIRST_NAME]: parts[0] || 'TroopDebug',
      [DC_COLUMNS.GIRL_LAST_NAME]: SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME,
      [DC_COLUMNS.ORDER_DATE]: TODAY,
      [DC_COLUMNS.ORDER_TYPE]: 'In-Person Delivery',
      [DC_COLUMNS.TOTAL_PACKAGES]: '3',
      [DC_COLUMNS.REFUNDED_PACKAGES]: '0',
      [DC_COLUMNS.CURRENT_SALE_AMOUNT]: '18',
      [DC_COLUMNS.ORDER_STATUS]: 'Completed',
      [DC_COLUMNS.PAYMENT_STATUS]: DC_PAYMENT_STATUS.CAPTURED,
      [DC_COLUMNS.DONATION]: '0'
    });
    n++;
    log('Injected synthetic site DELIVERY order (unallocated girl delivery)');
  }

  // =========================================================================
  // 7. Unallocated Troop Direct Ship
  //    → "Unallocated troop orders" alert
  //    directShip.allocated comes from store.allocations with DIRECT_SHIP channel
  // =========================================================================
  let removedDS = false;
  for (let i = store.allocations.length - 1; i >= 0; i--) {
    if (store.allocations[i].channel === ALLOCATION_CHANNEL.DIRECT_SHIP) {
      log(`Removed DIRECT_SHIP allocation for girl ${store.allocations[i].girlId}`);
      store.allocations.splice(i, 1);
      removedDS = true;
      n++;
      break;
    }
  }
  if (!removedDS) {
    // Inject a site DIRECT_SHIP order with no matching allocation
    const site = siteScoutName(store);
    const parts = site.split(' ');
    store.rawDCData.push({
      [DC_COLUMNS.ORDER_NUMBER]: 'DEBUG-DS-001',
      [DC_COLUMNS.GIRL_FIRST_NAME]: parts[0] || 'TroopDebug',
      [DC_COLUMNS.GIRL_LAST_NAME]: SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME,
      [DC_COLUMNS.ORDER_DATE]: TODAY,
      [DC_COLUMNS.ORDER_TYPE]: 'Shipped by Girl Scouts',
      [DC_COLUMNS.TOTAL_PACKAGES]: '2',
      [DC_COLUMNS.REFUNDED_PACKAGES]: '0',
      [DC_COLUMNS.CURRENT_SALE_AMOUNT]: '12',
      [DC_COLUMNS.ORDER_STATUS]: 'Shipped',
      [DC_COLUMNS.PAYMENT_STATUS]: DC_PAYMENT_STATUS.CAPTURED,
      [DC_COLUMNS.DONATION]: '0'
    });
    n++;
    log('Injected synthetic site DIRECT_SHIP order (unallocated direct ship)');
  }

  // =========================================================================
  // 8. Unallocated Booth Sale
  //    → "Unallocated troop orders" alert, warning on Completed Booths
  //    boothSale.allocated comes from store.allocations with BOOTH channel
  // =========================================================================
  let removedBooth = false;
  for (let i = store.allocations.length - 1; i >= 0; i--) {
    if (store.allocations[i].channel === ALLOCATION_CHANNEL.BOOTH) {
      log(`Removed BOOTH allocation for girl ${store.allocations[i].girlId}`);
      store.allocations.splice(i, 1);
      removedBooth = true;
      n++;
      break;
    }
  }
  if (!removedBooth) {
    // Inject a site BOOTH order with no matching allocation
    // DC "Cookies in Hand" + Site lastname → classified as BOOTH
    const site = siteScoutName(store);
    const parts = site.split(' ');
    store.rawDCData.push({
      [DC_COLUMNS.ORDER_NUMBER]: 'DEBUG-BS-001',
      [DC_COLUMNS.GIRL_FIRST_NAME]: parts[0] || 'TroopDebug',
      [DC_COLUMNS.GIRL_LAST_NAME]: SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME,
      [DC_COLUMNS.ORDER_DATE]: TODAY,
      [DC_COLUMNS.ORDER_TYPE]: 'Cookies in Hand',
      [DC_COLUMNS.TOTAL_PACKAGES]: '4',
      [DC_COLUMNS.REFUNDED_PACKAGES]: '0',
      [DC_COLUMNS.CURRENT_SALE_AMOUNT]: '24',
      [DC_COLUMNS.ORDER_STATUS]: 'Completed',
      [DC_COLUMNS.PAYMENT_STATUS]: DC_PAYMENT_STATUS.CASH,
      [DC_COLUMNS.DONATION]: '0'
    });
    n++;
    log('Injected synthetic site BOOTH order (unallocated booth sale)');
  }

  // =========================================================================
  // 9. Booth needs distribution
  //    → "Booths need distribution" alert, "Needs Distribution" pill
  //    countBoothsNeedingDistribution counts past booths with isDistributed=false
  // =========================================================================
  let flippedBooth = false;
  for (const res of store.boothReservations) {
    if (res.booth.reservationType?.toLowerCase().includes('virtual')) continue;
    if (res.booth.isDistributed) {
      res.booth.isDistributed = false;
      flippedBooth = true;
      n++;
      log(`Set isDistributed=false on booth "${res.booth.storeName}"`);
      break;
    }
  }
  if (!flippedBooth) {
    // Inject a synthetic past booth reservation that's not distributed
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
    n++;
    log('Injected synthetic past booth reservation (needs distribution)');
  }

  // =========================================================================
  // 10. Donations need adjustment
  //     → "Donations need adjustment" alert, adjustment rows on Donations report
  //     reconciled = (dcManualEntry === scManualEntries)
  //     Strategy: reduce SC manual entries to create mismatch
  // =========================================================================
  // The global reconciliation uses COOKIE_SHARE_RECORD transfers (scManualEntries).
  // The per-scout "Entered in SC" column uses virtualCookieShareAllocations (girlId → count).
  // We need to reduce BOTH to make the badge AND the per-row adjustment visible.

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
    const scout = anyScoutName(store);
    const parts = scout.split(' ');
    store.rawDCData.push({
      [DC_COLUMNS.ORDER_NUMBER]: 'DEBUG-DON-001',
      [DC_COLUMNS.GIRL_FIRST_NAME]: parts[0] || 'Debug',
      [DC_COLUMNS.GIRL_LAST_NAME]: parts.slice(1).join(' ') || 'Scout',
      [DC_COLUMNS.ORDER_DATE]: TODAY,
      [DC_COLUMNS.ORDER_TYPE]: 'In-Person Delivery',
      [DC_COLUMNS.TOTAL_PACKAGES]: '3',
      [DC_COLUMNS.REFUNDED_PACKAGES]: '0',
      [DC_COLUMNS.CURRENT_SALE_AMOUNT]: '18',
      [DC_COLUMNS.ORDER_STATUS]: 'Completed',
      [DC_COLUMNS.PAYMENT_STATUS]: DC_PAYMENT_STATUS.CASH,
      [DC_COLUMNS.DONATION]: '2'
    });
    // No matching SC record → dcManualEntry=2, scManualEntries=0 → not reconciled
    n++;
    log('Injected synthetic DC order with 2 manual-entry donations (no SC match)');
  }

  Logger.info(`[Debug] Applied ${n} debug mutations to DataStore`);
}
