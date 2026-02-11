// Scout Registration and Helper Functions

import { TRANSFER_TYPE } from '../../constants';
import { COOKIE_TYPE } from '../../cookie-constants';
import type { DataStore } from '../../data-store';
import { mergeOrCreateOrder } from '../../data-store-operations';
import type { CookieType, RawScoutData, Varieties } from '../../types';
import { parseVarietiesFromAPI } from './parsers';

/** Record import metadata (timestamp + source entry) */
export function recordImportMetadata(
  reconciler: DataStore,
  timestampField: 'lastImportDC' | 'lastImportSC' | 'lastImportSCReport',
  sourceType: string,
  records: number
): void {
  const now = new Date().toISOString();
  reconciler.metadata[timestampField] = now;
  reconciler.metadata.sources.push({ type: sourceType, date: now, records });
}

/** Register a scout by name, optionally setting metadata fields (non-null values only) */
export function updateScoutData(reconciler: DataStore, scoutName: string, data: Partial<RawScoutData> = {}): void {
  if (!reconciler.scouts.has(scoutName)) {
    reconciler.scouts.set(scoutName, {
      name: scoutName,
      scoutId: null,
      gsusaId: null,
      gradeLevel: null,
      serviceUnit: null,
      troopId: null,
      council: null,
      district: null
    });
  }

  const scout = reconciler.scouts.get(scoutName);
  if (!scout) return;

  for (const key of Object.keys(data) as Array<keyof RawScoutData>) {
    if (data[key] !== null && data[key] !== undefined) {
      (scout as Record<string, any>)[key] = data[key];
    }
  }
}

/** Register a scout by girlId, creating the scout entry if needed */
export function registerScout(reconciler: DataStore, girlId: number, girl: Record<string, any>): void {
  const scoutName = `${girl.first_name || ''} ${girl.last_name || ''}`.trim();
  if (!girlId || !scoutName) return;

  if (!reconciler.scouts.has(scoutName)) {
    updateScoutData(reconciler, scoutName, { scoutId: girlId });
  } else {
    const scout = reconciler.scouts.get(scoutName);
    if (scout && !scout.scoutId) {
      scout.scoutId = girlId;
    }
  }
}

/** Register scouts from an API transfer (T2G pickup, G2T return, Cookie Share) */
export function trackScoutFromAPITransfer(reconciler: DataStore, type: string, to: string, from: string): void {
  if (type === TRANSFER_TYPE.T2G && to !== from) {
    updateScoutData(reconciler, to, {});
  }
  if (type === TRANSFER_TYPE.G2T && to !== from) {
    updateScoutData(reconciler, from, {});
  }
  if (type.includes(TRANSFER_TYPE.COOKIE_SHARE)) {
    updateScoutData(reconciler, to, {});
  }
}

/** Merge a Digital Cookie order found in Smart Cookie data (D-prefixed order numbers) */
export function mergeDCOrderFromSC(
  reconciler: DataStore,
  orderNum: string,
  scout: string,
  transferData: { date: string; packages: number; amount: number },
  varieties: Varieties,
  source: string,
  rawData: Record<string, any>
): void {
  const dcOrderNum = orderNum.substring(1);
  mergeOrCreateOrder(
    reconciler,
    dcOrderNum,
    {
      orderNumber: dcOrderNum,
      scout,
      date: transferData.date,
      packages: Math.abs(transferData.packages),
      amount: Math.abs(transferData.amount),
      status: 'In SC Only',
      varieties
    },
    source,
    rawData
  );
}

/** Parse a girl's cookie allocation, deduplicating by key. Returns null if zero packages or duplicate. */
export function parseGirlAllocation(
  girl: Record<string, any>,
  dedupePrefix: string | number,
  seen: Set<string>,
  reconciler: DataStore,
  dynamicCookieIdMap: Record<number, CookieType> | null
): { girlId: number; varieties: Varieties; totalPackages: number; trackedCookieShare: number } | null {
  const girlId = girl.id;
  const { varieties, totalPackages } = parseVarietiesFromAPI(girl.cookies, dynamicCookieIdMap);
  if (totalPackages === 0) return null;

  const dedupeKey = `${dedupePrefix}-${girlId}`;
  if (seen.has(dedupeKey)) return null;
  seen.add(dedupeKey);

  registerScout(reconciler, girlId, girl);
  return { girlId, varieties, totalPackages, trackedCookieShare: varieties[COOKIE_TYPE.COOKIE_SHARE] || 0 };
}
