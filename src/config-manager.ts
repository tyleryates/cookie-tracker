import * as path from 'node:path';
import { loadJsonFile, saveJsonFile } from './json-file-utils';
import Logger from './logger';
import type { AppConfig } from './types';

/** Expected element types for array config fields (defaults are empty, so we declare explicitly) */
const ARRAY_ELEMENT_TYPES: Partial<Record<keyof AppConfig, string>> = {
  boothIds: 'number',
  boothDayFilters: 'string',
  boothNotifiedSlots: 'string',
  ignoredTimeSlots: 'string'
};

class ConfigManager {
  private configPath: string;

  constructor(dataDir: string) {
    this.configPath = path.join(dataDir, 'config.json');
  }

  getDefaults(): AppConfig {
    return {
      autoUpdateEnabled: true,
      autoSyncEnabled: true,
      autoRefreshBoothsEnabled: true,
      availableBoothsEnabled: false,
      boothAlertImessage: false,
      boothAlertRecipient: '',
      boothNotifiedSlots: [],
      boothIds: [],
      boothDayFilters: [],
      ignoredTimeSlots: []
    };
  }

  loadConfig(): AppConfig {
    const defaults = this.getDefaults();
    try {
      // Values are runtime-validated below before assignment to typed result
      const disk = loadJsonFile<Record<string, any>>(this.configPath);
      if (disk === null) {
        this.saveConfig(defaults);
        return defaults;
      }

      // Only pick known keys and validate types match defaults
      let healed = false;
      const result = { ...defaults };
      for (const key of Object.keys(defaults) as Array<keyof AppConfig>) {
        if (key in disk) {
          const defaultType = Array.isArray(defaults[key]) ? 'array' : typeof defaults[key];
          const diskType = Array.isArray(disk[key]) ? 'array' : typeof disk[key];
          if (diskType === defaultType) {
            // For arrays, validate element types match expected schema
            const expectedEl = ARRAY_ELEMENT_TYPES[key];
            if (expectedEl && Array.isArray(disk[key]) && !disk[key].every((el: unknown) => typeof el === expectedEl)) {
              healed = true;
            } else {
              (result[key] as AppConfig[typeof key]) = disk[key];
            }
          } else {
            healed = true;
          }
        }
      }
      // Detect unknown keys
      for (const key of Object.keys(disk)) {
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

  updateConfig(partial: Partial<AppConfig>): AppConfig {
    const current = this.loadConfig();
    const updated = { ...current, ...partial };
    this.saveConfig(updated);
    return updated;
  }
}

export default ConfigManager;
