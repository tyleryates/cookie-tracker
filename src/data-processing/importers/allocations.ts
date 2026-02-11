// Allocation Import Functions (direct ship dividers, booth dividers, reservations, booth locations)

import { ALLOCATION_CHANNEL, ALLOCATION_SOURCE } from '../../constants';
import { COOKIE_TYPE } from '../../cookie-constants';
import type { DataStore } from '../../data-store';
import type { BoothAvailableDate, BoothLocation, CookieType } from '../../types';
import { sumPhysicalPackages } from '../utils';
import { parseVarietiesFromAPI } from './parsers';
import { parseGirlAllocation, registerScout } from './scout-helpers';

/** Import Smart Direct Ship Divider allocations */
function importDirectShipDivider(reconciler: DataStore, dividerData: Record<string, any>): void {
  const girls = dividerData.girls || [];

  girls.forEach((girl: Record<string, any>) => {
    const girlId = girl.id;
    const cookies = girl.cookies || [];

    // Parse varieties from cookies array
    const { varieties } = parseVarietiesFromAPI(cookies);

    reconciler.allocations.push({
      channel: ALLOCATION_CHANNEL.DIRECT_SHIP,
      girlId: girlId,
      packages: sumPhysicalPackages(varieties),
      donations: varieties[COOKIE_TYPE.COOKIE_SHARE] || 0,
      varieties: varieties,
      source: ALLOCATION_SOURCE.DIRECT_SHIP_DIVIDER
    });
  });
}

/** Import Virtual Cookie Share allocations */
function importVirtualCookieShares(reconciler: DataStore, virtualCookieShares: Record<string, any>[]): void {
  virtualCookieShares.forEach((cookieShare: Record<string, any>) => {
    const girls = cookieShare.girls || [];
    const isBoothDivider = !!cookieShare.smart_divider_id;
    if (isBoothDivider) return; // Booth cookie share tracked via booth divider allocations
    const targetMap = reconciler.virtualCookieShareAllocations;

    girls.forEach((girl: Record<string, any>) => {
      const girlId = girl.id;
      const quantity = girl.quantity || 0;

      registerScout(reconciler, girlId, girl);

      // Accumulate into appropriate map (manual vs booth divider)
      const current = targetMap.get(girlId) || 0;
      targetMap.set(girlId, current + quantity);
    });
  });
}

/** Import booth reservation data from Smart Cookie reservations API */
function importReservations(
  reconciler: DataStore,
  reservationsData: Record<string, any>,
  dynamicCookieIdMap: Record<number, CookieType> | null
): void {
  const reservations = reservationsData?.reservations || reservationsData || [];
  if (!Array.isArray(reservations) || reservations.length === 0) return;

  reconciler.boothReservations = [];

  reservations.forEach((r) => {
    const booth = r.booth || {};
    const timeslot = r.timeslot || {};
    const { varieties, totalPackages } = parseVarietiesFromAPI(r.cookies, dynamicCookieIdMap);

    reconciler.boothReservations.push({
      id: r.id || r.reservation_id,
      troopId: r.troop_id,
      booth: {
        boothId: booth.booth_id,
        storeName: booth.store_name || '',
        address: booth.address || '',
        reservationType: booth.reservation_type || '',
        isDistributed: booth.is_distributed || false,
        isVirtuallyDistributed: booth.is_virtually_distributed || false
      },
      timeslot: {
        date: timeslot.date || '',
        startTime: timeslot.start_time || '',
        endTime: timeslot.end_time || ''
      },
      cookies: varieties,
      totalPackages: totalPackages,
      physicalPackages: sumPhysicalPackages(varieties),
      trackedCookieShare: varieties[COOKIE_TYPE.COOKIE_SHARE] || 0
    });
  });
}

/**
 * Import booth divider allocations from Smart Booth Divider API
 * Also registers girlId→name mapping from the divider response data
 * so that allocations aren't silently dropped for girls without SC Report data.
 */
function importBoothDividers(
  reconciler: DataStore,
  boothDividers: Record<string, any>[],
  dynamicCookieIdMap: Record<number, CookieType> | null
): void {
  if (!Array.isArray(boothDividers) || boothDividers.length === 0) return;

  // Track seen (reservationId, girlId) pairs to prevent duplicates
  const seen = new Set<string>();

  boothDividers.forEach((entry) => {
    const divider = entry.divider || {};
    const girls = divider.girls || [];
    // Handle both formats: booth can be the nested sub-object or the full reservation
    const rawBooth = entry.booth || {};
    const booth = rawBooth.booth_id ? rawBooth : rawBooth.booth || rawBooth;
    const timeslot = rawBooth.timeslot || entry.timeslot || {};

    girls.forEach((girl: Record<string, any>) => {
      const alloc = parseGirlAllocation(girl, entry.reservationId, seen, reconciler, dynamicCookieIdMap);
      if (!alloc) return;

      reconciler.allocations.push({
        channel: ALLOCATION_CHANNEL.BOOTH,
        girlId: alloc.girlId,
        packages: sumPhysicalPackages(alloc.varieties),
        donations: alloc.trackedCookieShare,
        varieties: alloc.varieties,
        source: ALLOCATION_SOURCE.SMART_BOOTH_DIVIDER,
        reservationId: entry.reservationId,
        storeName: booth.store_name || booth.booth_name || booth.location || '',
        date: timeslot.date || '',
        startTime: timeslot.start_time || timeslot.startTime || '',
        endTime: timeslot.end_time || timeslot.endTime || '',
        reservationType: booth.reservation_type || booth.type || ''
      });
    });
  });
}

/** Import Direct Ship Divider allocations from Smart Cookie API */
function importDirectShipDividers(
  reconciler: DataStore,
  directShipDividers: Record<string, any>[],
  dynamicCookieIdMap: Record<number, CookieType> | null
): void {
  if (!Array.isArray(directShipDividers) || directShipDividers.length === 0) return;

  // Track seen (orderId, girlId) pairs to prevent duplicates
  const seen = new Set<string>();

  directShipDividers.forEach((entry) => {
    const divider = entry.divider || entry;
    const girls = divider.girls || [];

    girls.forEach((girl: Record<string, any>) => {
      const orderId = entry.orderId || entry.id || '';
      const alloc = parseGirlAllocation(girl, orderId, seen, reconciler, dynamicCookieIdMap);
      if (!alloc) return;

      reconciler.allocations.push({
        channel: ALLOCATION_CHANNEL.DIRECT_SHIP,
        girlId: alloc.girlId,
        packages: sumPhysicalPackages(alloc.varieties),
        donations: alloc.trackedCookieShare,
        varieties: alloc.varieties,
        source: ALLOCATION_SOURCE.SMART_DIRECT_SHIP_DIVIDER,
        orderId: orderId
      });
    });
  });
}

/** Normalize a raw booth location from the API to a BoothLocation */
export function normalizeBoothLocation(loc: Record<string, any>): BoothLocation {
  const addr = loc.address || {};

  let availableDates: BoothAvailableDate[] | undefined;
  if (loc.availableDates?.length > 0) {
    availableDates = loc.availableDates.map((d: any) => ({
      date: d.date || '',
      timeSlots: (d.timeSlots || []).map((s: any) => ({
        startTime: s.start_time || s.startTime || '',
        endTime: s.end_time || s.endTime || ''
      }))
    }));
  }

  return {
    id: loc.id || loc.booth_id || 0,
    storeName: loc.store_name || loc.name || '',
    address: {
      street: addr.street || addr.address_1 || '',
      city: addr.city || '',
      state: addr.state || '',
      zip: addr.zip || addr.postal_code || ''
    },
    reservationType: loc.reservation_type || '',
    notes: loc.notes || '',
    availableDates
  };
}

/** Import booth locations from Smart Cookie booths/search API */
function importBoothLocations(reconciler: DataStore, locationsData: Record<string, any>[]): void {
  if (!Array.isArray(locationsData) || locationsData.length === 0) return;
  reconciler.boothLocations = locationsData.map(normalizeBoothLocation);
}

/** Import optional supplemental data from Smart Cookie API (dividers, booths, cookie shares) */
export function importAllocations(reconciler: DataStore, apiData: Record<string, any>): void {
  if (apiData.directShipDivider?.girls) {
    importDirectShipDivider(reconciler, apiData.directShipDivider);
  }

  if (apiData.virtualCookieShares && apiData.virtualCookieShares.length > 0) {
    importVirtualCookieShares(reconciler, apiData.virtualCookieShares);
  }

  if (apiData.cookieIdMap) {
    reconciler.metadata.cookieIdMap = apiData.cookieIdMap;
  }
  if (apiData.reservations) {
    importReservations(reconciler, apiData.reservations, apiData.cookieIdMap);
  }
  if (apiData.boothDividers?.length > 0) {
    importBoothDividers(reconciler, apiData.boothDividers, apiData.cookieIdMap);
  }
  if (apiData.directShipDivider?.length > 0) {
    importDirectShipDividers(reconciler, apiData.directShipDivider, apiData.cookieIdMap);
  }
  if (apiData.boothLocations?.length > 0) {
    importBoothLocations(reconciler, apiData.boothLocations);
  }
}
