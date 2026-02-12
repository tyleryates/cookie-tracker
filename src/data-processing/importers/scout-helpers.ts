// Scout Registration and Helper Functions

import { TRANSFER_TYPE } from '../../constants';
import { COOKIE_TYPE } from '../../cookie-constants';
import type { DataStore } from '../../data-store';
import { mergeOrCreateOrder } from '../../data-store-operations';
import type { SCDividerGirl } from '../../scrapers/sc-types';
import type { CookieType, RawScoutData, Varieties } from '../../types';
import { parseVarietiesFromAPI } from './parsers';

/** Record import metadata (timestamp + source entry) */
export function recordImportMetadata(
  store: DataStore,
  timestampField: 'lastImportDC' | 'lastImportSC' | 'lastImportSCReport',
  sourceType: string,
  records: number
): void {
  const now = new Date().toISOString();
  store.metadata[timestampField] = now;
  store.metadata.sources.push({ type: sourceType, date: now, records });
}

/** Register a scout by name, optionally setting metadata fields (non-null values only) */
export function updateScoutData(store: DataStore, scoutName: string, data: Partial<RawScoutData> = {}): void {
  if (!store.scouts.has(scoutName)) {
    store.scouts.set(scoutName, {
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

  const scout = store.scouts.get(scoutName);
  if (!scout) return;

  for (const key of Object.keys(data) as Array<keyof RawScoutData>) {
    if (data[key] !== null && data[key] !== undefined) {
      (scout as Record<string, any>)[key] = data[key];
    }
  }
}

/** Register a scout by girlId, creating the scout entry if needed */
export function registerScout(store: DataStore, girlId: number, girl: SCDividerGirl): void {
  const scoutName = `${girl.first_name || ''} ${girl.last_name || ''}`.trim();
  if (!girlId || !scoutName) return;

  if (!store.scouts.has(scoutName)) {
    updateScoutData(store, scoutName, { scoutId: girlId });
  } else {
    const scout = store.scouts.get(scoutName);
    if (scout && !scout.scoutId) {
      scout.scoutId = girlId;
    }
  }
}

/** Register scouts from an API transfer (T2G pickup, G2T return, Cookie Share) */
export function trackScoutFromAPITransfer(store: DataStore, type: string, to: string, from: string): void {
  if (type === TRANSFER_TYPE.T2G && to !== from) {
    updateScoutData(store, to, {});
  }
  if (type === TRANSFER_TYPE.G2T && to !== from) {
    updateScoutData(store, from, {});
  }
  if (type.includes(TRANSFER_TYPE.COOKIE_SHARE)) {
    updateScoutData(store, to, {});
  }
}

/** Merge a Digital Cookie order found in Smart Cookie data (D-prefixed order numbers) */
export function mergeDCOrderFromSC(
  store: DataStore,
  orderNum: string,
  scout: string,
  transferData: { date: string; packages: number; amount: number },
  varieties: Varieties,
  source: string,
  rawData: Record<string, unknown>
): void {
  const dcOrderNum = orderNum.substring(1);
  mergeOrCreateOrder(
    store,
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
  girl: SCDividerGirl,
  dedupePrefix: string | number,
  seen: Set<string>,
  store: DataStore,
  dynamicCookieIdMap: Record<string, CookieType> | null
): { girlId: number; varieties: Varieties; totalPackages: number; trackedCookieShare: number } | null {
  const girlId = girl.id;
  const { varieties, totalPackages } = parseVarietiesFromAPI(girl.cookies, dynamicCookieIdMap);
  if (totalPackages === 0) return null;

  const dedupeKey = `${dedupePrefix}-${girlId}`;
  if (seen.has(dedupeKey)) return null;
  seen.add(dedupeKey);

  registerScout(store, girlId, girl);
  return { girlId, varieties, totalPackages, trackedCookieShare: varieties[COOKIE_TYPE.COOKIE_SHARE] || 0 };
}
