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
import type { AppConfig, Credentials, IpcResponse, Timestamps } from './types';

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

}

// Auto-update configuration (notification-only, no auto-install)
autoUpdater.autoDownload = false; // Don't auto-download

autoUpdater.on('update-available', (info) => {
  Logger.debug('Update available:', info.version);
  mainWindow?.webContents.send('update-available', info);
});

autoUpdater.on('error', (err) => {
  Logger.error('Update check error:', err);
});

app.whenReady().then(() => {
  createWindow();

  // Check for updates on startup only (only in production)
  if (!app.isPackaged) {
    Logger.debug('Skipping update check in development');
  } else {
    setTimeout(() => {
      autoUpdater.checkForUpdates();
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
  handleIpcError(async (_event, { filename, content }: { filename: string; content: string }) => {
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

// Handle load credentials
ipcMain.handle(
  'load-credentials',
  handleIpcError(async () => {
    return credentialsManager.loadCredentials();
  })
);

// Handle save credentials
ipcMain.handle(
  'save-credentials',
  handleIpcError(async (_event: any, credentials: Credentials) => {
    return credentialsManager.saveCredentials(credentials);
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
  handleIpcError(async (_event: any, config: AppConfig) => {
    configManager.saveConfig(config);
  })
);

ipcMain.handle(
  'update-config',
  handleIpcError(async (_event: any, partial: Partial<AppConfig>) => {
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
    const results = await scraper.scrapeAll(auth.credentials, config.boothIds);

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
    await ensureSCSession();
    const scraper = new SmartCookieScraper(dataDir, null, scSession);
    const catalog = await scraper.fetchBoothCatalog(boothCache);
    const config = configManager.loadConfig();
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
    await ensureSCSession();
    const scraper = new SmartCookieScraper(dataDir, null, scSession);
    const catalog = await scraper.fetchBoothCatalog(boothCache);
    return catalog.map(normalizeBoothLocation);
  })
);

// Handle verify Smart Cookie credentials
ipcMain.handle(
  'verify-sc',
  handleIpcError(async (_event, { username, password }: { username: string; password: string }) => {
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
  handleIpcError(async (_event, { username, password }: { username: string; password: string }) => {
    const session = new DigitalCookieSession();
    const roles = await session.fetchRoles(username, password);
    return { roles };
  })
);

// Handle save seasonal data
ipcMain.handle(
  'save-seasonal-data',
  handleIpcError(async (_event, data: Partial<SeasonalDataFiles>) => {
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
  'wipe-config',
  handleIpcError(async () => {
    const configPath = path.join(dataDir, 'config.json');
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  })
);

ipcMain.handle(
  'wipe-data',
  handleIpcError(async () => {
    const currentDir = path.join(dataDir, 'current');
    const inDir = path.join(dataDir, 'in');
    if (fs.existsSync(currentDir)) fs.rmSync(currentDir, { recursive: true, force: true });
    if (fs.existsSync(inDir)) fs.rmSync(inDir, { recursive: true, force: true });
    if (fs.existsSync(timestampsPath)) fs.unlinkSync(timestampsPath);
    activeOrchestrator = null;
  })
);

// Handle export diagnostics zip
ipcMain.handle(
  'export-diagnostics',
  handleIpcError(async () => {
    if (!mainWindow) throw new Error('No main window');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    // biome-ignore lint/complexity/noBannedTypes: @types/electron is outdated; Electron 40 returns { canceled, filePath }
    const showSave = dialog.showSaveDialog as Function;
    const saveResult: { canceled: boolean; filePath?: string } = await showSave(mainWindow, {
      defaultPath: `cookie-tracker-diagnostics-${timestamp}.zip`,
      filters: [{ name: 'Zip Archives', extensions: ['zip'] }]
    });

    if (saveResult.canceled || !saveResult.filePath) return null;
    const filePath = saveResult.filePath;

    const currentDir = path.join(dataDir, 'current');
    const inDir = path.join(dataDir, 'in');
    const configPath = path.join(dataDir, 'config.json');

    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    const done = new Promise<void>((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
    });

    archive.pipe(output);

    // Add current/ directory (API responses, DC export, unified.json)
    if (fs.existsSync(currentDir)) {
      archive.directory(currentDir, 'current');
    }

    // Add data/in/ legacy files (ReportExport-*, CookieOrders-*)
    if (fs.existsSync(inDir)) {
      const inFiles = fs.readdirSync(inDir);
      for (const file of inFiles) {
        const fullPath = path.join(inDir, file);
        if (fs.statSync(fullPath).isFile()) {
          archive.file(fullPath, { name: `in/${file}` });
        }
      }
    }

    // Add config.json (not credentials)
    if (fs.existsSync(configPath)) {
      archive.file(configPath, { name: 'config.json' });
    }

    await archive.finalize();
    await done;

    return { path: filePath };
  })
);
