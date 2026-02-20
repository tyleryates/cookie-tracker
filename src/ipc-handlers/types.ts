import type { BrowserWindow } from 'electron';
import type ConfigManager from '../config-manager';
import type CredentialsManager from '../credentials-manager';
import type ProfileManager from '../profile-manager';
import type ScraperOrchestrator from '../scrapers';
import type BoothCache from '../scrapers/booth-cache';
import type { DigitalCookieSession } from '../scrapers/dc-session';
import type { SmartCookieSession } from '../scrapers/sc-session';
import type SeasonalData from '../seasonal-data';
import type { IpcResponse, Timestamps } from '../types';

export interface HandlerDeps {
  profileDir: () => string;
  profileReadOnly: () => boolean;
  configManager: () => ConfigManager;
  credentialsManager: CredentialsManager;
  seasonalData: () => SeasonalData;
  boothCache: () => BoothCache;
  scSession: SmartCookieSession;
  dcSession: DigitalCookieSession;
  mainWindow: () => BrowserWindow | null;
  activeOrchestrator: { get: () => ScraperOrchestrator | null; set: (v: ScraperOrchestrator | null) => void };
  loadTimestamps: () => Timestamps;
  saveTimestamps: (ts: Timestamps) => void;
  initializeProfileManagers: (dir: string) => void;
  profileManager: ProfileManager;
  rootDataDir: string;
  handleIpcError: <T>(handler: (...args: any[]) => Promise<T>) => (...args: any[]) => Promise<IpcResponse<T>>;
}
