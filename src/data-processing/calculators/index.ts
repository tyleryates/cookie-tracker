// Data Calculators - Main Orchestrator
// This module coordinates all calculation sub-modules to build the unified dataset

import type { IDataReconciler, Scout, UnifiedDataset, Warning } from '../../types';
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
function buildScoutDataset(reconciler: IDataReconciler, warnings: Warning[]): Map<string, Scout> {
  const rawDCData = reconciler.metadata.rawDCData || [];
  const scoutDataset = initializeScouts(reconciler, rawDCData);

  // Phase 1: Add orders from Digital Cookie
  addDCOrders(scoutDataset, rawDCData, warnings);

  // Phase 2: Add inventory from Smart Cookie T2G transfers
  addInventory(reconciler, scoutDataset);

  // Phase 3: Add allocations (virtual booth, direct ship, booth sales)
  addAllocations(reconciler, scoutDataset);

  // Phase 4: Calculate all scout-level totals
  calculateScoutTotals(scoutDataset);

  return scoutDataset;
}

/** Build unified dataset from reconciled data */
export function buildUnifiedDataset(reconciler: IDataReconciler): UnifiedDataset {
  const warnings: Warning[] = [];

  // Build complete scout dataset
  const scouts = buildScoutDataset(reconciler, warnings);

  // Build site orders dataset
  const siteOrders = buildSiteOrdersDataset(reconciler, scouts);

  // Calculate scout counts
  const scoutCounts = calculateScoutCounts(scouts);

  // Build package totals
  const packageTotals = calculatePackageTotals(reconciler.transfers);

  // Build troop totals
  const troopTotals = buildTroopTotals(reconciler, scouts, packageTotals, scoutCounts);

  // Build transfer breakdowns
  const transferBreakdowns = buildTransferBreakdowns(reconciler, warnings);

  // Build varieties
  const varieties = buildVarieties(reconciler, scouts);

  // Build Cookie Share tracking
  const cookieShareTracking = buildCookieShareTracking(reconciler);

  // Build metadata
  const metadata = buildUnifiedMetadata(reconciler, warnings, scouts);

  return {
    scouts,
    siteOrders,
    troopTotals,
    transferBreakdowns,
    varieties,
    cookieShare: cookieShareTracking,
    boothReservations: reconciler.boothReservations || [],
    boothLocations: reconciler.boothLocations || [],
    metadata,
    warnings
  };
}
