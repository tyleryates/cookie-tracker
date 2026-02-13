import * as fs from 'node:fs';
import * as path from 'node:path';
import { PIPELINE_FILES } from '../constants';
import Logger from '../logger';
import type { SCBoothLocationRaw, SCBoothTimeSlot } from './sc-types';

// Staleness thresholds
const STALENESS = {
  CATALOG: 4 * 60 * 60 * 1000, // 4 hours
  DATES: 60 * 60 * 1000, // 1 hour
  TIME_SLOTS: 10 * 60 * 1000 // 10 minutes
} as const;

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

type BoothDatesData = { dates?: Array<string | { date: string }> } | Array<string | { date: string }>;
type BoothTimesData = { times?: SCBoothTimeSlot[]; slots?: SCBoothTimeSlot[] } | SCBoothTimeSlot[];

class BoothCache {
  private dataDir: string;
  private catalog: CacheEntry<SCBoothLocationRaw[]> | null = null;
  private dates = new Map<number, CacheEntry<BoothDatesData>>();
  private timeSlots = new Map<string, CacheEntry<BoothTimesData>>();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.hydrateCatalog();
  }

  /** Load catalog from the sc-booth-catalog.json pipeline file */
  private hydrateCatalog(): void {
    try {
      const filePath = path.join(this.dataDir, 'current', PIPELINE_FILES.SC_BOOTH_CATALOG);
      if (!fs.existsSync(filePath)) return;

      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const timestamp = fs.statSync(filePath).mtimeMs;

      if (Array.isArray(data) && data.length > 0 && timestamp > 0) {
        this.catalog = { data, fetchedAt: timestamp };
        Logger.debug(`Hydrated booth catalog from disk: ${data.length} booths, age ${Math.round((Date.now() - timestamp) / 60000)}m`);
      }
    } catch {
      // Non-fatal — cache starts empty
    }
  }

  private isFresh(entry: CacheEntry<unknown> | null | undefined, maxAge: number): boolean {
    if (!entry) return false;
    return Date.now() - entry.fetchedAt < maxAge;
  }

  isCatalogFresh(): boolean {
    return this.isFresh(this.catalog, STALENESS.CATALOG);
  }

  isDatesFresh(boothId: number): boolean {
    return this.isFresh(this.dates.get(boothId), STALENESS.DATES);
  }

  isTimeSlotsFresh(boothId: number, date: string): boolean {
    return this.isFresh(this.timeSlots.get(`${boothId}:${date}`), STALENESS.TIME_SLOTS);
  }

  getCatalog(): SCBoothLocationRaw[] | null {
    return this.catalog?.data ?? null;
  }

  setCatalog(data: SCBoothLocationRaw[]): void {
    this.catalog = { data, fetchedAt: Date.now() };
  }

  getDates(boothId: number): BoothDatesData | null {
    return this.dates.get(boothId)?.data ?? null;
  }

  setDates(boothId: number, data: BoothDatesData): void {
    this.dates.set(boothId, { data, fetchedAt: Date.now() });
  }

  getTimeSlots(boothId: number, date: string): BoothTimesData | null {
    return this.timeSlots.get(`${boothId}:${date}`)?.data ?? null;
  }

  setTimeSlots(boothId: number, date: string, data: BoothTimesData): void {
    this.timeSlots.set(`${boothId}:${date}`, { data, fetchedAt: Date.now() });
  }
}

export default BoothCache;
export type { BoothDatesData, BoothTimesData };
