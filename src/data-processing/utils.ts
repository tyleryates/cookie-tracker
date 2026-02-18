// Data Processing Utility Functions
// Shared helper functions used across data-processing modules

import { TRANSFER_TYPE } from '../constants';
import { COOKIE_TYPE } from '../cookie-constants';
import type { Varieties } from '../types';

/**
 * Check if a transfer type is a Council-to-Troop (C2T) transfer
 * C2T transfers represent incoming inventory from the council (NOT counted as sold)
 *
 * @param transferType - The transfer type to check
 * @returns True if this is a C2T transfer
 *
 * @example
 * isC2TTransfer('C2T')     // => true
 * isC2TTransfer('C2T(P)')  // => true
 * isC2TTransfer('C2T-123') // => true
 * isC2TTransfer('T2G')     // => false
 */
export function isC2TTransfer(transferType: string): boolean {
  if (!transferType) return false;
  return transferType === TRANSFER_TYPE.C2T || transferType === TRANSFER_TYPE.C2T_P || transferType.startsWith('C2T');
}

const KNOWN_TRANSFER_TYPES = new Set<string>([
  TRANSFER_TYPE.T2T,
  TRANSFER_TYPE.T2G,
  TRANSFER_TYPE.G2T,
  TRANSFER_TYPE.D,
  TRANSFER_TYPE.COOKIE_SHARE,
  TRANSFER_TYPE.COOKIE_SHARE_D,
  TRANSFER_TYPE.DIRECT_SHIP,
  TRANSFER_TYPE.PLANNED
]);

/**
 * Sum all non-Cookie-Share variety counts (physical packages only).
 * Replaces the subtraction pattern `packages - cookieShare` with a positive sum.
 */
export function sumPhysicalPackages(varieties: Record<string, number> | undefined): number {
  if (!varieties) return 0;
  return Object.entries(varieties)
    .filter(([variety]) => variety !== COOKIE_TYPE.COOKIE_SHARE)
    .reduce((sum, [, count]) => sum + (typeof count === 'number' ? count : 0), 0);
}

/**
 * Check if a transfer type is a known/recognized type.
 * Unknown types should trigger a warning so new API values don't get silently misclassified.
 */
export function isKnownTransferType(transferType: string): boolean {
  if (!transferType) return true; // Empty handled elsewhere
  if (isC2TTransfer(transferType)) return true; // C2T, C2T(P), C2T-xxx variants
  return KNOWN_TRANSFER_TYPES.has(transferType);
}

/** Accumulate variety counts into a target, optionally excluding Cookie Share */
export function accumulateVarieties(source: Varieties, target: Varieties, options?: { excludeCookieShare?: boolean; sign?: number }): void {
  const sign = options?.sign ?? 1;
  const excludeCS = options?.excludeCookieShare ?? false;
  for (const [variety, count] of Object.entries(source)) {
    if (excludeCS && variety === COOKIE_TYPE.COOKIE_SHARE) continue;
    if (typeof count === 'number') {
      target[variety as keyof Varieties] = (target[variety as keyof Varieties] || 0) + sign * count;
    }
  }
}

/** Convert a Map to a plain Record (string keys) */
export function mapToRecord<V>(map: ReadonlyMap<string | number, V>): Record<string, V> {
  const result: Record<string, V> = {};
  for (const [k, v] of map) result[String(k)] = v;
  return result;
}

/** Build physical varieties (everything except Cookie Share) from a full varieties map */
export function buildPhysicalVarieties(varieties: Varieties): Varieties {
  const result: Varieties = {};
  for (const [variety, count] of Object.entries(varieties)) {
    if (variety !== COOKIE_TYPE.COOKIE_SHARE) {
      result[variety as keyof Varieties] = count;
    }
  }
  return result;
}
