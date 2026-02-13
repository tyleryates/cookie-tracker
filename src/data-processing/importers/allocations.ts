// Allocation Import Functions (direct ship dividers, booth dividers, reservations, booth locations)

import { ALLOCATION_CHANNEL, ALLOCATION_SOURCE } from '../../constants';
import { COOKIE_TYPE } from '../../cookie-constants';
import type { DataStore } from '../../data-store';
import type {
  SCBoothDividerResult,
  SCBoothLocationRaw,
  SCBoothTimeSlot,
  SCDirectShipDivider,
  SCReservationsResponse,
  SCVirtualCookieShare
} from '../../scrapers/sc-types';
import type { BoothAvailableDate, BoothLocation, CookieType } from '../../types';

/** Explicit params for allocation imports (replaces SCCombinedData) */
export interface AllocationData {
  directShipDivider?: SCDirectShipDivider | Record<string, any>[] | null;
  virtualCookieShares?: SCVirtualCookieShare[];
  reservations?: SCReservationsResponse | null;
  boothDividers?: SCBoothDividerResult[];
  boothLocations?: SCBoothLocationRaw[];
  cookieIdMap?: Record<string, CookieType> | null;
}

import { sumPhysicalPackages } from '../utils';
import { parseVarietiesFromAPI } from './parsers';
import { parseGirlAllocation, registerScout } from './scout-helpers';

/** Import Smart Direct Ship Divider allocations */
function importDirectShipDivider(store: DataStore, dividerData: SCDirectShipDivider): void {
  const girls = dividerData.girls || [];

  for (const girl of girls) {
    const girlId = girl.id;
    const cookies = girl.cookies || [];

    // Parse varieties from cookies array
    const { varieties } = parseVarietiesFromAPI(cookies);

    store.allocations.push({
      channel: ALLOCATION_CHANNEL.DIRECT_SHIP,
      girlId: girlId,
      packages: sumPhysicalPackages(varieties),
      donations: varieties[COOKIE_TYPE.COOKIE_SHARE] || 0,
      varieties: varieties,
      source: ALLOCATION_SOURCE.DIRECT_SHIP_DIVIDER
    });
  }
}

/** Import Virtual Cookie Share allocations */
function importVirtualCookieShares(store: DataStore, virtualCookieShares: SCVirtualCookieShare[]): void {
  for (const cookieShare of virtualCookieShares) {
    const girls = cookieShare.girls || [];
    const isBoothDivider = !!cookieShare.smart_divider_id;
    if (isBoothDivider) continue; // Booth cookie share tracked via booth divider allocations
    const targetMap = store.virtualCookieShareAllocations;

    for (const girl of girls) {
      const girlId = girl.id;
      const quantity = girl.quantity || 0;

      registerScout(store, girlId, girl);

      // Accumulate manual Cookie Share entries per girl
      const current = targetMap.get(girlId) || 0;
      targetMap.set(girlId, current + quantity);
    }
  }
}

/** Import booth reservation data from Smart Cookie reservations API */
function importReservations(
  store: DataStore,
  reservationsData: SCReservationsResponse,
  dynamicCookieIdMap: Record<string, CookieType> | null
): void {
  const reservations = reservationsData?.reservations || [];
  if (!Array.isArray(reservations) || reservations.length === 0) return;

  store.boothReservations = [];

  for (const r of reservations) {
    const booth = r.booth || {};
    const timeslot = r.timeslot || {};
    const { varieties, totalPackages } = parseVarietiesFromAPI(r.cookies, dynamicCookieIdMap);

    store.boothReservations.push({
      id: r.id || r.reservation_id || '',
      troopId: r.troop_id || '',
      booth: {
        boothId: booth.booth_id || '',
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
  }
}

/**
 * Import booth divider allocations from Smart Booth Divider API
 * Also registers girlId→name mapping from the divider response data
 * so that allocations aren't silently dropped for girls without SC Report data.
 */
function importBoothDividers(
  store: DataStore,
  boothDividers: SCBoothDividerResult[],
  dynamicCookieIdMap: Record<string, CookieType> | null
): void {
  if (!Array.isArray(boothDividers) || boothDividers.length === 0) return;

  // Track seen (reservationId, girlId) pairs to prevent duplicates
  const seen = new Set<string>();

  for (const entry of boothDividers) {
    const divider = entry.divider || {};
    const girls = divider.girls || [];
    // Handle both formats: booth can be the nested sub-object or the full reservation
    const rawBooth = entry.booth || {};
    const booth = rawBooth.booth_id ? rawBooth : rawBooth.booth || rawBooth;
    const timeslot = rawBooth.timeslot || entry.timeslot || {};

    for (const girl of girls) {
      const alloc = parseGirlAllocation(girl, entry.reservationId, seen, store, dynamicCookieIdMap);
      if (!alloc) continue;

      store.allocations.push({
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
    }
  }
}

/** Import Direct Ship Divider allocations from Smart Cookie API (legacy array format) */
function importDirectShipDividers(
  store: DataStore,
  directShipDividers: Record<string, any>[],
  dynamicCookieIdMap: Record<string, CookieType> | null
): void {
  if (!Array.isArray(directShipDividers) || directShipDividers.length === 0) return;

  // Track seen (orderId, girlId) pairs to prevent duplicates
  const seen = new Set<string>();

  for (const entry of directShipDividers) {
    const divider = entry.divider || entry;
    const girls = divider.girls || [];

    for (const girl of girls) {
      const orderId = entry.orderId || entry.id || '';
      const alloc = parseGirlAllocation(girl, orderId, seen, store, dynamicCookieIdMap);
      if (!alloc) continue;

      store.allocations.push({
        channel: ALLOCATION_CHANNEL.DIRECT_SHIP,
        girlId: alloc.girlId,
        packages: sumPhysicalPackages(alloc.varieties),
        donations: alloc.trackedCookieShare,
        varieties: alloc.varieties,
        source: ALLOCATION_SOURCE.SMART_DIRECT_SHIP_DIVIDER,
        orderId: orderId
      });
    }
  }
}

/** Normalize a raw booth location from the API to a BoothLocation */
export function normalizeBoothLocation(loc: SCBoothLocationRaw): BoothLocation {
  const addr = loc.address || {};

  let availableDates: BoothAvailableDate[] | undefined;
  if (loc.availableDates && loc.availableDates.length > 0) {
    availableDates = loc.availableDates.map((d) => ({
      date: d.date || '',
      timeSlots: (d.timeSlots || []).map((s: SCBoothTimeSlot) => ({
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
function importBoothLocations(store: DataStore, locationsData: SCBoothLocationRaw[]): void {
  if (!Array.isArray(locationsData) || locationsData.length === 0) return;
  store.boothLocations = locationsData.map(normalizeBoothLocation);
}

/** Import optional supplemental data from Smart Cookie API (dividers, booths, cookie shares) */
export function importAllocations(store: DataStore, data: AllocationData): void {
  const cookieIdMap = data.cookieIdMap ?? null;

  if (data.directShipDivider && !Array.isArray(data.directShipDivider) && data.directShipDivider.girls) {
    importDirectShipDivider(store, data.directShipDivider);
  }

  if (data.virtualCookieShares && data.virtualCookieShares.length > 0) {
    importVirtualCookieShares(store, data.virtualCookieShares);
  }

  if (cookieIdMap) {
    store.metadata.cookieIdMap = cookieIdMap;
  }
  if (data.reservations) {
    importReservations(store, data.reservations, cookieIdMap);
  }
  if (data.boothDividers && data.boothDividers.length > 0) {
    importBoothDividers(store, data.boothDividers, cookieIdMap);
  }
  if (Array.isArray(data.directShipDivider) && data.directShipDivider.length > 0) {
    importDirectShipDividers(store, data.directShipDivider, cookieIdMap);
  }
  if (data.boothLocations && data.boothLocations.length > 0) {
    importBoothLocations(store, data.boothLocations);
  }
}
