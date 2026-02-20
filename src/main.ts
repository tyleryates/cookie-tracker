import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, BrowserWindow } from 'electron';
import ConfigManager from './config-manager';
import CredentialsManager from './credentials-manager';
import { registerAllHandlers } from './ipc-handlers';
import Logger from './logger';
import ProfileManager from './profile-manager';
import type ScraperOrchestrator from './scrapers';
import BoothCache from './scrapers/booth-cache';
import { DigitalCookieSession } from './scrapers/dc-session';
import { SmartCookieSession } from './scrapers/sc-session';
import SeasonalData from './seasonal-data';
import type { EndpointMetadata, IpcResponse, Timestamps } from './types';
import { checkForUpdatesOnStartup, setupAutoUpdater } from './update-manager';

let mainWindow: BrowserWindow | null = null;
let activeOrchestrator: ScraperOrchestrator | null = null;

// Use app.getPath('userData') for data storage (works with packaged app)
// Production (packaged): ~/Library/Application Support/Cookie Tracker on macOS (uses productName)
// Development (npm start): ~/Library/Application Support/cookie-tracker on macOS (uses name)
// Windows production: %APPDATA%/Cookie Tracker
// Windows development: %APPDATA%/cookie-tracker
const userDataPath = app.getPath('userData');
const rootDataDir = path.join(userDataPath, 'data');

// Initialize logger at root level first so migration logs go to a file
Logger.init(rootDataDir);
if (app.isPackaged) Logger.disableConsole();

// Credentials + profiles live at root (shared across profiles)
const credentialsManager = new CredentialsManager(rootDataDir);
const profileManager = new ProfileManager(rootDataDir);

// Profile-specific managers (reinitialized on profile switch)
let profileDir: string;
let profileReadOnly = false;
let configManager: ConfigManager;
let boothCache: BoothCache;
let seasonalData: SeasonalData;
let timestampsPath: string;

function initializeProfileManagers(dir: string): void {
  profileDir = dir;
  profileReadOnly = path.basename(dir) !== 'default';
  configManager = new ConfigManager(profileDir);
  boothCache = new BoothCache(profileDir);
  seasonalData = new SeasonalData(profileDir);
  timestampsPath = path.join(profileDir, 'timestamps.json');
  // Don't write app.log into read-only profile snapshots
  if (!profileReadOnly) Logger.init(profileDir);
}

// Run migration + initialize before any IPC handlers fire
profileManager.migrate();
profileManager.renameDirs();
initializeProfileManagers(profileManager.getActiveProfileDir());

// Clean up stale root-level app.log (Logger.init(rootDataDir) creates it for migration,
// then initializeProfileManagers supersedes it with the profile-level log)
const rootLogPath = path.join(rootDataDir, 'app.log');
if (fs.existsSync(rootLogPath)) {
  try {
    fs.unlinkSync(rootLogPath);
  } catch {
    /* ignore */
  }
}

// Long-lived sessions — reused across syncs and booth API calls
const scSession = new SmartCookieSession();
const dcSession = new DigitalCookieSession();

const KNOWN_ENDPOINT_KEYS = new Set(['lastSync', 'status', 'durationMs', 'dataSize', 'httpStatus', 'error']);

function isValidEndpointMetadata(value: unknown): value is EndpointMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (v.status === 'synced' || v.status === 'error') && (v.lastSync === null || typeof v.lastSync === 'string');
}

/** Validate and heal raw endpoint data, migrating old formats and stripping unknown keys */
function healEndpoints(rawEndpoints: unknown): { endpoints: Record<string, EndpointMetadata>; healed: boolean } {
  const endpoints: Record<string, EndpointMetadata> = {};
  let healed = false;

  if (typeof rawEndpoints !== 'object' || rawEndpoints === null) return { endpoints, healed };

  for (const [ep, value] of Object.entries(rawEndpoints)) {
    // Migration: old format stored plain ISO strings
    if (typeof value === 'string') {
      endpoints[ep] = { lastSync: value, status: 'synced' };
      healed = true;
      continue;
    }
    const obj = value as Record<string, unknown>;
    if (!isValidEndpointMetadata(obj)) {
      healed = true;
      continue;
    }
    // Strip unknown keys within endpoint entries
    const cleaned: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) {
      if (KNOWN_ENDPOINT_KEYS.has(k)) cleaned[k] = obj[k];
      else healed = true;
    }
    endpoints[ep] = cleaned as unknown as EndpointMetadata;
  }

  return { endpoints, healed };
}

function loadTimestamps(): Timestamps {
  const empty: Timestamps = { endpoints: {}, lastUnifiedBuild: null };
  try {
    const raw = JSON.parse(fs.readFileSync(timestampsPath, 'utf8'));
    if (typeof raw !== 'object' || raw === null) return empty;

    const hasUnknownRootKeys = Object.keys(raw).some((k) => k !== 'endpoints' && k !== 'lastUnifiedBuild');
    const { endpoints, healed: endpointsHealed } = healEndpoints(raw.endpoints);

    const result: Timestamps = {
      endpoints,
      lastUnifiedBuild: typeof raw.lastUnifiedBuild === 'string' ? raw.lastUnifiedBuild : null
    };

    if (hasUnknownRootKeys || endpointsHealed) saveTimestamps(result);
    return result;
  } catch (err) {
    Logger.warn('Failed to load timestamps:', err);
    return empty;
  }
}

function saveTimestamps(timestamps: Timestamps): void {
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(timestampsPath, JSON.stringify(timestamps, null, 2));
}

// Standardized IPC error handler wrapper — always wraps to { success, data/error }
function handleIpcError<T>(handler: (...args: any[]) => Promise<T>): (...args: any[]) => Promise<IpcResponse<T>> {
  return async (...args) => {
    try {
      const result = await handler(...args);
      return { success: true, data: result };
    } catch (error) {
      Logger.error('IPC Handler Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  };
}

function createWindow(): void {
  Logger.info('Creating main window');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Prevent navigation away from the app and block new windows
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.on('closed', () => {
    Logger.info('Main window closed');
    mainWindow = null;
  });
}

// Auto-update — event handlers, download tracking, and install logic (see update-manager.ts)
setupAutoUpdater(() => mainWindow);

// Register all IPC handlers
registerAllHandlers({
  profileDir: () => profileDir,
  profileReadOnly: () => profileReadOnly,
  configManager: () => configManager,
  credentialsManager,
  seasonalData: () => seasonalData,
  boothCache: () => boothCache,
  scSession,
  dcSession,
  mainWindow: () => mainWindow,
  activeOrchestrator: {
    get: () => activeOrchestrator,
    set: (v) => {
      activeOrchestrator = v;
    }
  },
  loadTimestamps,
  saveTimestamps,
  initializeProfileManagers,
  profileManager,
  rootDataDir,
  handleIpcError
});

// App lifecycle events
app.on('before-quit', () => Logger.info('App event: before-quit'));
app.on('will-quit', () => {
  Logger.info('App event: will-quit');
  Logger.close();
});
app.on('quit', () => Logger.info('App event: quit'));

app.whenReady().then(() => {
  Logger.info(
    `App ready — platform=${process.platform}, arch=${process.arch}, electron=${process.versions.electron}, node=${process.versions.node}`
  );

  // Set dynamic User-Agent from Electron's Chromium version (replaces hardcoded fallback)
  const ua = app.userAgentFallback;
  scSession.userAgent = ua;
  dcSession.userAgent = ua;
  // Recreate HTTP clients so new UA takes effect before any API calls
  scSession.reset();
  dcSession.reset();

  createWindow();

  checkForUpdatesOnStartup(configManager.loadConfig().autoUpdate);
});

app.on('window-all-closed', () => {
  Logger.info('App event: window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  Logger.info('App event: activate');
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
