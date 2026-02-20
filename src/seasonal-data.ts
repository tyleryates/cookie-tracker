// SeasonalData — persists seasonal config (troop info, cookie map, DC roles)
// that changes once per year but was previously re-fetched on every sync.
// Same simple pattern as ConfigManager: load/save JSON, create dir if needed.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadJsonFile, saveJsonFile } from './json-file-utils';
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

  private deleteFile(name: string): void {
    try {
      const p = this.filePath(name);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (err) {
      Logger.warn(`Could not delete ${name}:`, (err as Error).message);
    }
  }

  loadTroop(): SCMeResponse | null {
    return loadJsonFile<SCMeResponse>(this.filePath('sc-troop.json'));
  }

  saveTroop(data: SCMeResponse): void {
    saveJsonFile(this.filePath('sc-troop.json'), data, 0o600);
  }

  loadCookies(): SCCookieMapEntry[] | null {
    return loadJsonFile<SCCookieMapEntry[]>(this.filePath('sc-cookies.json'));
  }

  saveCookies(data: SCCookieMapEntry[]): void {
    saveJsonFile(this.filePath('sc-cookies.json'), data, 0o600);
  }

  loadDCRoles(): DCRole[] | null {
    return loadJsonFile<DCRole[]>(this.filePath('dc-roles.json'));
  }

  saveDCRoles(data: DCRole[]): void {
    saveJsonFile(this.filePath('dc-roles.json'), data, 0o600);
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
