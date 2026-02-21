import * as path from 'node:path';
import { BOOTH_TIME_SLOTS } from './constants';
import { loadJsonFile, saveJsonFile } from './json-file-utils';
import Logger from './logger';
import type { AppConfig, AppConfigPatch, BoothFinderConfig } from './types';

/**
 * Convert legacy DayFilter objects ({ day, timeAfter?, timeBefore? }) to
 * the current "day|startTime" string format used by the checkbox grid.
 */
function migrateDayFilters(filters: unknown[]): string[] {
  const result: string[] = [];
  for (const f of filters) {
    if (typeof f === 'string') {
      result.push(f);
      continue;
    }
    if (typeof f !== 'object' || f === null || typeof (f as any).day !== 'number') continue;
    const { day, timeAfter, timeBefore } = f as { day: number; timeAfter?: string; timeBefore?: string };
    for (const slot of BOOTH_TIME_SLOTS) {
      if (timeAfter && slot.start < timeAfter) continue;
      if (timeBefore && slot.start >= timeBefore) continue;
      result.push(`${day}|${slot.start}`);
    }
  }
  return result;
}

/**
 * Convert legacy IgnoredTimeSlot objects ({ boothId, date, startTime }) to
 * the current "boothId|date|startTime" string format.
 */
function migrateIgnoredSlots(slots: unknown[]): string[] {
  const result: string[] = [];
  for (const s of slots) {
    if (typeof s === 'string') {
      result.push(s);
      continue;
    }
    if (typeof s !== 'object' || s === null) continue;
    const { boothId, date, startTime } = s as { boothId?: number; date?: string; startTime?: string };
    if (boothId != null && date && startTime) {
      result.push(`${boothId}|${date}|${startTime}`);
    }
  }
  return result;
}

const BOOTH_FINDER_DEFAULTS: BoothFinderConfig = {
  enabled: false,
  autoRefresh: true,
  imessage: false,
  imessageRecipient: '',
  notifiedSlots: [],
  ids: [],
  dayFilters: [],
  ignoredSlots: []
};

/** Map old flat config keys to their new nested boothFinder equivalents */
const LEGACY_BOOTH_KEY_MAP: Record<string, keyof BoothFinderConfig> = {
  availableBoothsEnabled: 'enabled',
  autoRefreshBoothsEnabled: 'autoRefresh',
  boothAlertImessage: 'imessage',
  boothAlertRecipient: 'imessageRecipient',
  boothNotifiedSlots: 'notifiedSlots',
  boothIds: 'ids',
  boothDayFilters: 'dayFilters',
  ignoredTimeSlots: 'ignoredSlots'
};

const LEGACY_TOP_LEVEL_MAP: Record<string, keyof AppConfig> = {
  autoUpdateEnabled: 'autoUpdate',
  autoSyncEnabled: 'autoSync'
};

/** Expected element types for array fields inside boothFinder */
const BOOTH_ARRAY_TYPES: Partial<Record<keyof BoothFinderConfig, string>> = {
  ids: 'number',
  dayFilters: 'string',
  notifiedSlots: 'string',
  ignoredSlots: 'string'
};

/** Migrate legacy config formats in-place. Returns true if any migration was applied. */
function migrateLegacyConfig(disk: Record<string, any>): boolean {
  let migrated = false;

  // Migrate legacy top-level key renames (e.g. autoUpdateEnabled → autoUpdate)
  for (const [oldKey, newKey] of Object.entries(LEGACY_TOP_LEVEL_MAP)) {
    if (oldKey in disk && !(newKey in disk)) {
      disk[newKey] = disk[oldKey];
      delete disk[oldKey];
      migrated = true;
    }
  }

  // Migrate legacy flat booth keys into nested boothFinder
  const hasLegacyBoothKeys = Object.keys(LEGACY_BOOTH_KEY_MAP).some((k) => k in disk);
  if (hasLegacyBoothKeys) {
    if (!disk.boothFinder || typeof disk.boothFinder !== 'object') {
      disk.boothFinder = {};
    }
    for (const [oldKey, newKey] of Object.entries(LEGACY_BOOTH_KEY_MAP)) {
      if (oldKey in disk) {
        if (!(newKey in disk.boothFinder)) {
          disk.boothFinder[newKey] = disk[oldKey];
        }
        delete disk[oldKey];
      }
    }
    migrated = true;
  }

  // Migrate legacy DayFilter objects to "day|startTime" string format
  if (disk.boothFinder && typeof disk.boothFinder === 'object') {
    if (Array.isArray(disk.boothFinder.dayFilters) && disk.boothFinder.dayFilters.some((f: unknown) => typeof f === 'object')) {
      disk.boothFinder.dayFilters = migrateDayFilters(disk.boothFinder.dayFilters);
      migrated = true;
    }
    // Migrate legacy IgnoredTimeSlot objects to "boothId|date|startTime" string format
    if (Array.isArray(disk.boothFinder.ignoredSlots) && disk.boothFinder.ignoredSlots.some((s: unknown) => typeof s === 'object')) {
      disk.boothFinder.ignoredSlots = migrateIgnoredSlots(disk.boothFinder.ignoredSlots);
      migrated = true;
    }
  }

  return migrated;
}

class ConfigManager {
  private configPath: string;

  constructor(dataDir: string) {
    this.configPath = path.join(dataDir, 'config.json');
  }

  getDefaults(): AppConfig {
    return {
      autoUpdate: true,
      autoSync: true
    };
  }

  loadConfig(): AppConfig {
    const defaults = this.getDefaults();
    try {
      const disk = loadJsonFile<Record<string, any>>(this.configPath);
      if (disk === null) {
        this.saveConfig(defaults);
        return defaults;
      }

      let healed = migrateLegacyConfig(disk);
      const result: AppConfig = { ...defaults };

      // Pick known top-level keys
      for (const key of Object.keys(defaults) as Array<keyof typeof defaults>) {
        if (key in disk && typeof disk[key] === typeof defaults[key]) {
          (result[key] as AppConfig[typeof key]) = disk[key];
        } else if (key in disk) {
          healed = true;
        }
      }

      // Preserve boothFinder if present on disk (secret feature — app never creates it)
      if (disk.boothFinder && typeof disk.boothFinder === 'object' && !Array.isArray(disk.boothFinder)) {
        const bf = { ...BOOTH_FINDER_DEFAULTS };
        for (const key of Object.keys(BOOTH_FINDER_DEFAULTS) as Array<keyof BoothFinderConfig>) {
          if (!(key in disk.boothFinder)) continue;
          const defaultType = Array.isArray(BOOTH_FINDER_DEFAULTS[key]) ? 'array' : typeof BOOTH_FINDER_DEFAULTS[key];
          const diskType = Array.isArray(disk.boothFinder[key]) ? 'array' : typeof disk.boothFinder[key];
          if (diskType !== defaultType) {
            healed = true;
            continue;
          }
          // Validate array element types
          const expectedEl = BOOTH_ARRAY_TYPES[key];
          if (
            expectedEl &&
            Array.isArray(disk.boothFinder[key]) &&
            !disk.boothFinder[key].every((el: unknown) => typeof el === expectedEl)
          ) {
            healed = true;
            continue;
          }
          (bf[key] as BoothFinderConfig[typeof key]) = disk.boothFinder[key];
        }
        result.boothFinder = bf;
      }

      // Detect unknown top-level keys
      for (const key of Object.keys(disk)) {
        if (key === 'boothFinder') continue;
        if (!(key in defaults)) healed = true;
      }

      if (healed) this.saveConfig(result);
      return result;
    } catch (error) {
      Logger.error('Error loading config:', error);
      this.saveConfig(defaults);
      return defaults;
    }
  }

  saveConfig(config: AppConfig): void {
    saveJsonFile(this.configPath, config, 0o600);
  }

  updateConfig(patch: AppConfigPatch): AppConfig {
    const current = this.loadConfig();
    const { boothFinder: boothPatch, ...rest } = patch;
    const updated: AppConfig = { ...current, ...rest };
    if (boothPatch && current.boothFinder) {
      updated.boothFinder = { ...current.boothFinder, ...boothPatch };
    }
    this.saveConfig(updated);
    return updated;
  }
}

export default ConfigManager;
