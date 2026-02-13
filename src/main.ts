import * as fs from 'node:fs';
import * as path from 'node:path';
import archiver from 'archiver';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import ConfigManager from './config-manager';
import { PIPELINE_FILES } from './constants';
import CredentialsManager from './credentials-manager';
import { loadData } from './data-pipeline';
import { normalizeBoothLocation } from './data-processing/importers';
import Logger from './logger';
import ScraperOrchestrator from './scrapers';
import { savePipelineFile } from './scrapers/base-scraper';
import BoothCache from './scrapers/booth-cache';
import { DigitalCookieSession } from './scrapers/dc-session';
import { SmartCookieSession } from './scrapers/sc-session';
import SmartCookieScraper from './scrapers/smart-cookie';
import SeasonalData, { type SeasonalDataFiles } from './seasonal-data';
import type { AppConfig, CredentialPatch, Credentials, CredentialsSummary, IpcResponse, Timestamps } from './types';

let mainWindow: BrowserWindow | null = null;
let activeOrchestrator: ScraperOrchestrator | null = null;

// Use app.getPath('userData') for data storage (works with packaged app)
// Production (packaged): ~/Library/Application Support/Cookie Tracker on macOS (uses productName)
// Development (npm start): ~/Library/Application Support/cookie-tracker on macOS (uses name)
// Windows production: %APPDATA%/Cookie Tracker
// Windows development: %APPDATA%/cookie-tracker
const userDataPath = app.getPath('userData');
const dataDir = path.join(userDataPath, 'data');

const credentialsManager = new CredentialsManager(dataDir);
const configManager = new ConfigManager(dataDir);
const boothCache = new BoothCache(dataDir);
const seasonalData = new SeasonalData(dataDir);

// Long-lived sessions — reused across syncs and booth API calls
const scSession = new SmartCookieSession();
const dcSession = new DigitalCookieSession();

// Timestamps — persisted to disk so auto-sync knows what's fresh after restart
const timestampsPath = path.join(dataDir, 'timestamps.json');

function loadTimestamps(): Timestamps {
  try {
    const raw = JSON.parse(fs.readFileSync(timestampsPath, 'utf8'));
    return { endpoints: raw.endpoints || {}, lastUnifiedBuild: raw.lastUnifiedBuild || null };
  } catch {
    return { endpoints: {}, lastUnifiedBuild: null };
  }
}

function saveTimestamps(timestamps: Timestamps): void {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
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

function loadAndValidateCredentials(): { credentials: Credentials; error?: undefined } | { credentials?: undefined; error: string } {
  const credentials = credentialsManager.loadCredentials();
  const validation = credentialsManager.validateCredentials(credentials);
  if (!validation.valid) {
    return { error: validation.error || 'Invalid credentials' };
  }
  return { credentials };
}

/** Ensure the long-lived SC session is authenticated, logging in if needed */
async function ensureSCSession(): Promise<void> {
  if (scSession.isAuthenticated) return;
  const credentials = credentialsManager.loadCredentials();
  if (!credentials?.smartCookie?.username || !credentials?.smartCookie?.password) {
    throw new Error('No Smart Cookie credentials configured. Please set up logins first.');
  }
  await scSession.login(credentials.smartCookie.username, credentials.smartCookie.password);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Prevent navigation away from the app and block new windows
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

// Auto-update configuration — downloads silently, renderer shows restart banner
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-available', (info) => {
  Logger.debug('Update available:', info.version);
  mainWindow?.webContents.send('update-available', { version: info.version });
});

autoUpdater.on('update-downloaded', (info) => {
  Logger.debug('Update downloaded:', info.version);
  mainWindow?.webContents.send('update-downloaded', { version: info.version });
});

autoUpdater.on('error', (err) => {
  Logger.error('Update check error:', err);
});

app.whenReady().then(() => {
  // Set dynamic User-Agent from Electron's Chromium version (replaces hardcoded fallback)
  const ua = app.userAgentFallback;
  scSession.userAgent = ua;
  dcSession.userAgent = ua;
  // Recreate HTTP clients so new UA takes effect before any API calls
  scSession.reset();
  dcSession.reset();

  createWindow();

  // Check for updates on startup only (only in production)
  if (!app.isPackaged) {
    Logger.debug('Skipping update check in development');
  } else {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => Logger.error('Update check failed:', err));
    }, 3000); // Check 3 seconds after app starts
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle load-data: full data pipeline (scan → parse → build → return UnifiedDataset)
ipcMain.handle(
  'load-data',
  handleIpcError(async () => {
    return loadData(dataDir);
  })
);

// Handle save file (for unified dataset caching — saves to current/)
ipcMain.handle(
  'save-file',
  handleIpcError(async (_event: Electron.IpcMainInvokeEvent, { filename, content }: { filename: string; content: string }) => {
    const currentDir = path.join(dataDir, 'current');
    if (!fs.existsSync(currentDir)) fs.mkdirSync(currentDir, { recursive: true });

    // Sanitize filename to prevent path traversal
    const sanitizedFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!sanitizedFilename || sanitizedFilename.startsWith('.')) {
      throw new Error('Invalid filename provided');
    }

    const filePath = path.join(currentDir, sanitizedFilename);
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(currentDir);
    if (!resolvedPath.startsWith(resolvedDir + path.sep) && resolvedPath !== resolvedDir) {
      throw new Error('Path traversal attempt detected');
    }

    fs.writeFileSync(filePath, content, 'utf8');
    return { path: filePath };
  })
);

// Handle load credentials — returns summary without passwords
ipcMain.handle(
  'load-credentials',
  handleIpcError(async (): Promise<CredentialsSummary> => {
    const creds = credentialsManager.loadCredentials();
    return {
      smartCookie: {
        username: creds.smartCookie.username || '',
        hasPassword: !!creds.smartCookie.password
      },
      digitalCookie: {
        username: creds.digitalCookie.username || '',
        hasPassword: !!creds.digitalCookie.password,
        role: creds.digitalCookie.role,
        councilId: creds.digitalCookie.councilId
      }
    };
  })
);

// Handle save credentials — merges partial patch with existing credentials
ipcMain.handle(
  'save-credentials',
  handleIpcError(async (_event: Electron.IpcMainInvokeEvent, patch: CredentialPatch) => {
    const existing = credentialsManager.loadCredentials();
    const merged = {
      smartCookie: { ...existing.smartCookie, ...patch.smartCookie },
      digitalCookie: { ...existing.digitalCookie, ...patch.digitalCookie }
    };
    return credentialsManager.saveCredentials(merged);
  })
);

// Handle config operations
ipcMain.handle(
  'load-config',
  handleIpcError(async () => {
    return configManager.loadConfig();
  })
);

ipcMain.handle(
  'save-config',
  handleIpcError(async (_event: Electron.IpcMainInvokeEvent, config: AppConfig) => {
    configManager.saveConfig(config);
  })
);

ipcMain.handle(
  'update-config',
  handleIpcError(async (_event: Electron.IpcMainInvokeEvent, partial: Partial<AppConfig>) => {
    const updated = configManager.updateConfig(partial);
    return updated;
  })
);

// Handle scrape websites
ipcMain.handle(
  'scrape-websites',
  handleIpcError(async (event) => {
    const auth = loadAndValidateCredentials();
    if (auth.error || !auth.credentials) {
      throw new Error(auth.error || 'No credentials available');
    }

    // Initialize scraper orchestrator with long-lived sessions
    const scraper = new ScraperOrchestrator(dataDir, seasonalData, boothCache, scSession, dcSession);
    activeOrchestrator = scraper;

    // Set up progress callback
    scraper.setProgressCallback((progress) => {
      event.sender.send('scrape-progress', progress);
    });

    // Small delay to ensure renderer's progress listener is fully registered
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Run scraping (pass configured booth IDs)
    const config = configManager.loadConfig();
    const results = await scraper.scrapeAll(auth.credentials, config.availableBoothsEnabled ? config.boothIds : []);

    // Persist per-endpoint sync timestamps for restart survival
    const ts = loadTimestamps();
    for (const [ep, info] of Object.entries(results.endpointStatuses)) {
      if (info.lastSync) ts.endpoints[ep] = info.lastSync;
    }
    saveTimestamps(ts);

    activeOrchestrator = null;
    return results;
  })
);

// Handle cancel sync
ipcMain.handle(
  'cancel-sync',
  handleIpcError(async () => {
    if (activeOrchestrator) {
      activeOrchestrator.cancel();
      activeOrchestrator = null;
    }
  })
);

// Handle booth locations refresh (re-fetch just booth availability without full sync)
// Uses long-lived SC session, logging in if needed
ipcMain.handle(
  'refresh-booth-locations',
  handleIpcError(async () => {
    const config = configManager.loadConfig();
    if (!config.availableBoothsEnabled) return [];

    await ensureSCSession();
    const scraper = new SmartCookieScraper(dataDir, null, scSession);
    const catalog = await scraper.fetchBoothCatalog(boothCache);
    const boothLocations = await scraper.fetchBoothAvailability(config.boothIds, catalog, boothCache);

    // Persist enriched booth locations to disk for the pipeline
    if (boothLocations.length > 0 && config.boothIds.length > 0) {
      savePipelineFile(dataDir, PIPELINE_FILES.SC_BOOTH_LOCATIONS, boothLocations);
    }

    // Persist booth sync timestamp
    const ts = loadTimestamps();
    ts.endpoints['sc-booth-availability'] = new Date().toISOString();
    saveTimestamps(ts);

    return boothLocations.map(normalizeBoothLocation);
  })
);

// Fetch ALL booth locations (no availability) for the booth selector UI
ipcMain.handle(
  'fetch-booth-catalog',
  handleIpcError(async () => {
    const config = configManager.loadConfig();
    if (!config.availableBoothsEnabled) return [];

    await ensureSCSession();
    const scraper = new SmartCookieScraper(dataDir, null, scSession);
    const catalog = await scraper.fetchBoothCatalog(boothCache);
    return catalog.map(normalizeBoothLocation);
  })
);

// Handle verify Smart Cookie credentials
ipcMain.handle(
  'verify-sc',
  handleIpcError(async (_event: Electron.IpcMainInvokeEvent, { username, password }: { username: string; password: string }) => {
    const session = new SmartCookieSession();
    await session.login(username, password);

    const troop = await session.fetchMe();
    if (!troop) throw new Error('Could not fetch troop info from /me');

    const cookies = await session.apiGet('/webapi/api/me/cookies', 'Cookie map fetch');

    return { troop, cookies: cookies || [] };
  })
);

// Handle verify Digital Cookie credentials
ipcMain.handle(
  'verify-dc',
  handleIpcError(async (_event: Electron.IpcMainInvokeEvent, { username, password }: { username: string; password: string }) => {
    const session = new DigitalCookieSession();
    const roles = await session.fetchRoles(username, password);
    return { roles };
  })
);

// Handle save seasonal data
ipcMain.handle(
  'save-seasonal-data',
  handleIpcError(async (_event: Electron.IpcMainInvokeEvent, data: Partial<SeasonalDataFiles>) => {
    seasonalData.saveAll(data);
  })
);

// Handle load seasonal data
ipcMain.handle(
  'load-seasonal-data',
  handleIpcError(async () => {
    return seasonalData.loadAll();
  })
);

// Load persisted timestamps (for restart survival + UI display)
ipcMain.handle(
  'load-timestamps',
  handleIpcError(async () => {
    return loadTimestamps();
  })
);

// Record when unified dataset was last built
ipcMain.handle(
  'record-unified-build',
  handleIpcError(async () => {
    const ts = loadTimestamps();
    ts.lastUnifiedBuild = new Date().toISOString();
    saveTimestamps(ts);
  })
);

// Wipe handlers (debug/testing utilities)
ipcMain.handle(
  'wipe-logins',
  handleIpcError(async () => {
    scSession.reset();
    dcSession.reset();
    const credPath = path.join(dataDir, 'credentials.enc');
    if (fs.existsSync(credPath)) fs.unlinkSync(credPath);
  })
);

ipcMain.handle(
  'wipe-data',
  handleIpcError(async () => {
    // Keep only login-related files (credentials + seasonal data used for verification)
    const KEEP_FILES = new Set(['credentials.enc', 'sc-troop.json', 'sc-cookies.json', 'dc-roles.json']);
    if (fs.existsSync(dataDir)) {
      for (const entry of fs.readdirSync(dataDir)) {
        if (KEEP_FILES.has(entry)) continue;
        const fullPath = path.join(dataDir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(fullPath);
        }
      }
    }
    activeOrchestrator = null;
  })
);

ipcMain.handle(
  'quit-and-install',
  handleIpcError(async () => {
    autoUpdater.quitAndInstall();
  })
);

// Handle export diagnostics zip
ipcMain.handle(
  'export-diagnostics',
  handleIpcError(async () => {
    if (!mainWindow) throw new Error('No main window');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    // Electron type defs resolve showSaveDialog overload incorrectly with BrowserWindow
    const showSave: (w: BrowserWindow, o: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue> =
      dialog.showSaveDialog.bind(dialog);
    const saveResult = await showSave(mainWindow, {
      defaultPath: `cookie-tracker-diagnostics-${timestamp}.zip`,
      filters: [{ name: 'Zip Archives', extensions: ['zip'] }]
    });

    if (saveResult.canceled || !saveResult.filePath) return null;
    const filePath = saveResult.filePath;

    const EXCLUDED_FILES = new Set(['credentials.enc']);

    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    const done = new Promise<void>((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
    });

    archive.pipe(output);

    // Add everything in dataDir except credentials
    if (fs.existsSync(dataDir)) {
      for (const entry of fs.readdirSync(dataDir)) {
        if (EXCLUDED_FILES.has(entry)) continue;
        const fullPath = path.join(dataDir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          archive.directory(fullPath, entry);
        } else if (stat.isFile()) {
          archive.file(fullPath, { name: entry });
        }
      }
    }

    await archive.finalize();
    await done;

    return { path: filePath };
  })
);
