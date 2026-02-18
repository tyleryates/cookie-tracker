// Data Calculators - Main Orchestrator
// This module coordinates all calculation sub-modules to build the unified dataset

import type { ReadonlyDataStore } from '../../data-store';
import type { Scout, UnifiedDataset, Warning } from '../../types';
import { mapToRecord } from '../utils';
import { addAllocations, addInventory } from './allocation-processing';
import { buildCookieShareTracking } from './cookie-share-tracking';
import { buildUnifiedMetadata } from './metadata';
import { addDCOrders } from './order-processing';
import { calculatePackageTotals } from './package-totals';
import { calculateScoutCounts, calculateScoutTotals } from './scout-calculations';
import { initializeScouts } from './scout-initialization';
import { buildSiteOrdersDataset } from './site-orders';
import { buildTransferBreakdowns } from './transfer-breakdowns';
import { buildTroopTotals } from './troop-totals';
import { buildVarieties } from './varieties';

/** Build complete scout dataset with all calculations */
function buildScoutDataset(store: ReadonlyDataStore, warnings: Warning[]): Record<string, Scout> {
  const rawDCData = store.rawDCData;
  const scoutDataset = initializeScouts(store, rawDCData);

  // Phase 1: Add orders from Digital Cookie
  addDCOrders(scoutDataset, rawDCData, warnings);

  // Phase 2: Add inventory from Smart Cookie T2G transfers
  addInventory(store, scoutDataset);

  // Phase 3: Add allocations (virtual booth, direct ship, booth sales)
  addAllocations(store, scoutDataset);

  // Phase 4: Calculate all scout-level totals
  calculateScoutTotals(scoutDataset);

  return Object.fromEntries(scoutDataset);
}

/** Build unified dataset from reconciled data */
function buildUnifiedDataset(store: ReadonlyDataStore): UnifiedDataset {
  const warnings: Warning[] = [];

  // Build complete scout dataset
  const scouts = buildScoutDataset(store, warnings);

  // Build site orders dataset
  const siteOrders = buildSiteOrdersDataset(store, scouts);

  // Calculate scout counts
  const scoutCounts = calculateScoutCounts(scouts);

  // Build package totals
  const packageTotals = calculatePackageTotals(store.transfers);

  // Build troop totals
  const troopTotals = buildTroopTotals(store, scouts, packageTotals, scoutCounts);

  // Build transfer breakdowns
  const transferBreakdowns = buildTransferBreakdowns(store, warnings);

  // Build varieties
  const varieties = buildVarieties(store, scouts);

  // Build Cookie Share tracking
  const cookieShareTracking = buildCookieShareTracking(store);

  // Build metadata
  const metadata = buildUnifiedMetadata(store, warnings, scouts);

  return {
    scouts,
    siteOrders,
    troopTotals,
    transferBreakdowns,
    varieties,
    cookieShare: cookieShareTracking,
    boothReservations: store.boothReservations,
    boothLocations: store.boothLocations,
    metadata,
    warnings,
    virtualCookieShareAllocations: mapToRecord(store.virtualCookieShareAllocations),
    hasTransferData: store.transfers.length > 0
  };
}

export { buildUnifiedDataset };
