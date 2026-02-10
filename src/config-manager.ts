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
      autoSyncEnabled: true,
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
      return { ...defaults, ...disk };
    } catch (error) {
      Logger.error('Error loading config:', error);
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
