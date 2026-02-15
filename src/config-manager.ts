import * as fs from 'node:fs';
import * as path from 'node:path';
import Logger from './logger';
import type { AppConfig } from './types';

class ConfigManager {
  configPath: string;

  constructor(dataDir: string) {
    this.configPath = path.join(dataDir, 'config.json');
  }

  getDefaults(): AppConfig {
    return {
      autoUpdateEnabled: false,
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
      if (!fs.existsSync(this.configPath)) {
        this.saveConfig(defaults);
        return defaults;
      }
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const disk = JSON.parse(raw);
      if (typeof disk !== 'object' || disk === null) {
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
            (result as any)[key] = disk[key];
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
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
    } catch (error) {
      Logger.error('Error saving config:', error);
    }
  }

  updateConfig(partial: Partial<AppConfig>): AppConfig {
    const current = this.loadConfig();
    const updated = { ...current, ...partial };
    this.saveConfig(updated);
    return updated;
  }
}

export default ConfigManager;
