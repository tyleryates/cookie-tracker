// SeasonalData — persists seasonal config (troop info, cookie map, DC roles)
// that changes once per year but was previously re-fetched on every sync.
// Same simple pattern as ConfigManager: load/save JSON, create dir if needed.

import * as fs from 'node:fs';
import * as path from 'node:path';
import Logger from './logger';
import type { SCCookieMapEntry, SCMeResponse } from './scrapers/sc-types';

export interface DCRole {
  id: string;
  name: string;
}

export interface SeasonalDataFiles {
  troop: SCMeResponse | null;
  cookies: SCCookieMapEntry[] | null;
  dcRoles: DCRole[] | null;
}

class SeasonalData {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  private filePath(name: string): string {
    return path.join(this.dataDir, name);
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private loadJson<T>(name: string): T | null {
    try {
      const p = this.filePath(name);
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (err) {
      Logger.warn(`Could not load ${name}:`, (err as Error).message);
      return null;
    }
  }

  private saveJson(name: string, data: unknown): void {
    try {
      this.ensureDir();
      fs.writeFileSync(this.filePath(name), JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      Logger.warn(`Could not save ${name}:`, (err as Error).message);
    }
  }

  private deleteFile(name: string): void {
    try {
      const p = this.filePath(name);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (err) {
      Logger.warn(`Could not delete ${name}:`, (err as Error).message);
    }
  }

  loadTroop(): SCMeResponse | null {
    return this.loadJson<SCMeResponse>('sc-troop.json');
  }

  saveTroop(data: SCMeResponse): void {
    this.saveJson('sc-troop.json', data);
  }

  loadCookies(): SCCookieMapEntry[] | null {
    return this.loadJson<SCCookieMapEntry[]>('sc-cookies.json');
  }

  saveCookies(data: SCCookieMapEntry[]): void {
    this.saveJson('sc-cookies.json', data);
  }

  loadDCRoles(): DCRole[] | null {
    return this.loadJson<DCRole[]>('dc-roles.json');
  }

  saveDCRoles(data: DCRole[]): void {
    this.saveJson('dc-roles.json', data);
  }

  loadAll(): SeasonalDataFiles {
    return {
      troop: this.loadTroop(),
      cookies: this.loadCookies(),
      dcRoles: this.loadDCRoles()
    };
  }

  saveAll(data: Partial<SeasonalDataFiles>): void {
    if (data.troop !== undefined) {
      if (data.troop !== null) this.saveTroop(data.troop);
      else this.deleteFile('sc-troop.json');
    }
    if (data.cookies !== undefined) {
      if (data.cookies !== null) this.saveCookies(data.cookies);
      else this.deleteFile('sc-cookies.json');
    }
    if (data.dcRoles !== undefined) {
      if (data.dcRoles !== null) this.saveDCRoles(data.dcRoles);
      else this.deleteFile('dc-roles.json');
    }
  }
}

export default SeasonalData;
