import { describe, expect, it } from 'vitest';
import { TRANSFER_TYPE } from '../../constants';
import { COOKIE_TYPE } from '../../cookie-constants';
import type { Varieties } from '../../types';
import {
  accumulateVarieties,
  buildPhysicalVarieties,
  isC2TTransfer,
  isKnownTransferType,
  sumPhysicalPackages
} from '../utils';

// =============================================================================
// isC2TTransfer
// =============================================================================

describe('isC2TTransfer', () => {
  it('returns true for C2T', () => {
    expect(isC2TTransfer('C2T')).toBe(true);
  });

  it('returns true for C2T(P)', () => {
    expect(isC2TTransfer('C2T(P)')).toBe(true);
  });

  it('returns true for C2T-xxx variants', () => {
    expect(isC2TTransfer('C2T-123')).toBe(true);
    expect(isC2TTransfer('C2T-abc')).toBe(true);
  });

  it('returns false for non-C2T types', () => {
    expect(isC2TTransfer('T2G')).toBe(false);
    expect(isC2TTransfer('G2T')).toBe(false);
    expect(isC2TTransfer('D')).toBe(false);
  });

  it('returns false for empty/falsy input', () => {
    expect(isC2TTransfer('')).toBe(false);
  });
});

// =============================================================================
// isKnownTransferType
// =============================================================================

describe('isKnownTransferType', () => {
  it('recognizes all standard transfer types', () => {
    expect(isKnownTransferType(TRANSFER_TYPE.T2T)).toBe(true);
    expect(isKnownTransferType(TRANSFER_TYPE.T2G)).toBe(true);
    expect(isKnownTransferType(TRANSFER_TYPE.G2T)).toBe(true);
    expect(isKnownTransferType(TRANSFER_TYPE.D)).toBe(true);
    expect(isKnownTransferType(TRANSFER_TYPE.COOKIE_SHARE)).toBe(true);
    expect(isKnownTransferType(TRANSFER_TYPE.COOKIE_SHARE_D)).toBe(true);
    expect(isKnownTransferType(TRANSFER_TYPE.DIRECT_SHIP)).toBe(true);
    expect(isKnownTransferType(TRANSFER_TYPE.PLANNED)).toBe(true);
  });

  it('recognizes C2T variants', () => {
    expect(isKnownTransferType('C2T')).toBe(true);
    expect(isKnownTransferType('C2T(P)')).toBe(true);
    expect(isKnownTransferType('C2T-999')).toBe(true);
  });

  it('returns false for unknown types', () => {
    expect(isKnownTransferType('UNKNOWN')).toBe(false);
    expect(isKnownTransferType('X2Y')).toBe(false);
    expect(isKnownTransferType('something-random')).toBe(false);
  });

  it('returns true for empty string (handled elsewhere)', () => {
    expect(isKnownTransferType('')).toBe(true);
  });
});

// =============================================================================
// sumPhysicalPackages
// =============================================================================

describe('sumPhysicalPackages', () => {
  it('sums all physical varieties', () => {
    expect(sumPhysicalPackages({ THIN_MINTS: 5, TREFOILS: 3 })).toBe(8);
  });

  it('excludes COOKIE_SHARE from the sum', () => {
    expect(sumPhysicalPackages({ THIN_MINTS: 5, [COOKIE_TYPE.COOKIE_SHARE]: 2 })).toBe(5);
  });

  it('returns 0 for undefined input', () => {
    expect(sumPhysicalPackages(undefined)).toBe(0);
  });

  it('returns 0 for empty object', () => {
    expect(sumPhysicalPackages({})).toBe(0);
  });

  it('returns 0 when only COOKIE_SHARE is present', () => {
    expect(sumPhysicalPackages({ [COOKIE_TYPE.COOKIE_SHARE]: 10 })).toBe(0);
  });
});

// =============================================================================
// accumulateVarieties
// =============================================================================

describe('accumulateVarieties', () => {
  it('accumulates source into target', () => {
    const target: Varieties = { THIN_MINTS: 2 };
    accumulateVarieties({ THIN_MINTS: 3, TREFOILS: 5 }, target);
    expect(target.THIN_MINTS).toBe(5);
    expect(target.TREFOILS).toBe(5);
  });

  it('respects excludeCookieShare option', () => {
    const target: Varieties = {};
    accumulateVarieties({ THIN_MINTS: 3, COOKIE_SHARE: 2 }, target, { excludeCookieShare: true });
    expect(target.THIN_MINTS).toBe(3);
    expect(target.COOKIE_SHARE).toBeUndefined();
  });

  it('respects sign: -1 option', () => {
    const target: Varieties = { THIN_MINTS: 10 };
    accumulateVarieties({ THIN_MINTS: 3 }, target, { sign: -1 });
    expect(target.THIN_MINTS).toBe(7);
  });

  it('combines excludeCookieShare and sign options', () => {
    const target: Varieties = { THIN_MINTS: 10, COOKIE_SHARE: 5 };
    accumulateVarieties({ THIN_MINTS: 2, COOKIE_SHARE: 3 }, target, { excludeCookieShare: true, sign: -1 });
    expect(target.THIN_MINTS).toBe(8);
    expect(target.COOKIE_SHARE).toBe(5); // unchanged
  });
});

// =============================================================================
// buildPhysicalVarieties
// =============================================================================

describe('buildPhysicalVarieties', () => {
  it('copies all varieties except COOKIE_SHARE', () => {
    const input: Varieties = { THIN_MINTS: 5, TREFOILS: 3, COOKIE_SHARE: 2 };
    const result = buildPhysicalVarieties(input);
    expect(result.THIN_MINTS).toBe(5);
    expect(result.TREFOILS).toBe(3);
    expect(result.COOKIE_SHARE).toBeUndefined();
  });

  it('returns empty object for COOKIE_SHARE-only input', () => {
    const result = buildPhysicalVarieties({ COOKIE_SHARE: 10 });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('returns empty object for empty input', () => {
    const result = buildPhysicalVarieties({});
    expect(Object.keys(result)).toHaveLength(0);
  });
});
