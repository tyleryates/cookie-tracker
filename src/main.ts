import { execFile, execSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import archiver from 'archiver';
import { app, BrowserWindow, dialog, ipcMain, autoUpdater as nativeUpdater } from 'electron';
import { autoUpdater } from 'electron-updater';
import ConfigManager from './config-manager';
import { PIPELINE_FILES } from './constants';
import CredentialsManager from './credentials-manager';
import { loadData } from './data-pipeline';
import { normalizeBoothLocation } from './data-processing/importers';
import Logger from './logger';
import ProfileManager from './profile-manager';
import ScraperOrchestrator from './scrapers';
import { savePipelineFile } from './scrapers/base-scraper';
import BoothCache from './scrapers/booth-cache';
import { DigitalCookieSession } from './scrapers/dc-session';
import { SmartCookieSession } from './scrapers/sc-session';
import SmartCookieScraper from './scrapers/smart-cookie';
import SeasonalData, { type SeasonalDataFiles } from './seasonal-data';
import type { AppConfig, CredentialPatch, Credentials, CredentialsSummary, EndpointMetadata, IpcResponse, Timestamps } from './types';

let mainWindow: BrowserWindow | null = null;
let activeOrchestrator: ScraperOrchestrator | null = null;
let downloadedUpdateFile: string | null = null;

// Use app.getPath('userData') for data storage (works with packaged app)
// Production (packaged): ~/Library/Application Support/Cookie Tracker on macOS (uses productName)
// Development (npm start): ~/Library/Application Support/cookie-tracker on macOS (uses name)
// Windows production: %APPDATA%/Cookie Tracker
// Windows development: %APPDATA%/cookie-tracker
const userDataPath = app.getPath('userData');
const rootDataDir = path.join(userDataPath, 'data');

// Initialize logger at root level first so migration logs go to a file
Logger.init(rootDataDir);

// Credentials + profiles live at root (shared across profiles)
const credentialsManager = new CredentialsManager(rootDataDir);
const profileManager = new ProfileManager(rootDataDir);

// Profile-specific managers (reinitialized on profile switch)
let profileDir: string;
let configManager: ConfigManager;
let boothCache: BoothCache;
let seasonalData: SeasonalData;
let timestampsPath: string;

function initializeProfileManagers(dir: string): void {
  profileDir = dir;
  configManager = new ConfigManager(profileDir);
  boothCache = new BoothCache(profileDir);
  seasonalData = new SeasonalData(profileDir);
  timestampsPath = path.join(profileDir, 'timestamps.json');
  Logger.init(profileDir);
}

// Run migration + initialize before any IPC handlers fire
profileManager.migrate();
initializeProfileManagers(profileManager.getActiveProfileDir());

// Long-lived sessions — reused across syncs and booth API calls
const scSession = new SmartCookieSession();
const dcSession = new DigitalCookieSession();

const KNOWN_ENDPOINT_KEYS = new Set(['lastSync', 'status', 'durationMs', 'dataSize', 'httpStatus', 'error']);

function isValidEndpointMetadata(value: unknown): value is EndpointMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (v.status === 'synced' || v.status === 'error') && (v.lastSync === null || typeof v.lastSync === 'string');
}

function loadTimestamps(): Timestamps {
  const empty: Timestamps = { endpoints: {}, lastUnifiedBuild: null };
  try {
    const raw = JSON.parse(fs.readFileSync(timestampsPath, 'utf8'));
    if (typeof raw !== 'object' || raw === null) return empty;

    let healed = false;
    const endpoints: Record<string, EndpointMetadata> = {};

    // Strip unknown root keys
    for (const key of Object.keys(raw)) {
      if (key !== 'endpoints' && key !== 'lastUnifiedBuild') {
        healed = true;
      }
    }

    const rawEndpoints = raw.endpoints;
    if (typeof rawEndpoints === 'object' && rawEndpoints !== null) {
      for (const [ep, value] of Object.entries(rawEndpoints)) {
        // Migration: old format stored plain ISO strings
        if (typeof value === 'string') {
          endpoints[ep] = { lastSync: value, status: 'synced' };
          healed = true;
          continue;
        }
        // Work with raw object before type narrowing
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
    }

    const result: Timestamps = {
      endpoints,
      lastUnifiedBuild: typeof raw.lastUnifiedBuild === 'string' ? raw.lastUnifiedBuild : null
    };

    if (healed) saveTimestamps(result);
    return result;
  } catch {
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

// Renderer log relay — fire-and-forget, no response needed
ipcMain.handle('log-message', (_event, line: string) => {
  Logger.appendLine(line);
  return { success: true };
});

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
  Logger.info('Creating main window');
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

  mainWindow.on('closed', () => {
    Logger.info('Main window closed');
    mainWindow = null;
  });
}

// Auto-update configuration — downloads silently, renderer shows restart banner
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
Logger.info(`Auto-updater configured: autoDownload=true, autoInstallOnAppQuit=true, isPackaged=${app.isPackaged}`);

autoUpdater.on('checking-for-update', () => {
  Logger.info('Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  Logger.info(`Update available: v${info.version}`);
  mainWindow?.webContents.send('update-available', { version: info.version });
});

autoUpdater.on('update-not-available', (info) => {
  Logger.info(`No update available (current: v${info.version})`);
});

let downloadProgressReceived = false;
autoUpdater.on('update-downloaded', (info) => {
  const downloadedFile = (info as any).downloadedFile as string | undefined;
  let fileSize: string | undefined;
  if (downloadedFile && fs) {
    try {
      const stat = fs.statSync(downloadedFile);
      fileSize = `${(stat.size / (1024 * 1024)).toFixed(1)}MB`;
    } catch {
      fileSize = 'stat failed';
    }
  }
  Logger.info(
    `Update downloaded: v${info.version}, file=${downloadedFile || 'unknown'}, size=${fileSize || 'unknown'}, hadProgress=${downloadProgressReceived}`
  );
  if (!downloadProgressReceived) {
    Logger.info('Update was cached (no download-progress events received) — file from previous download');
  }
  downloadProgressReceived = false;
  downloadedUpdateFile = downloadedFile || null;
  mainWindow?.webContents.send('update-downloaded', { version: info.version });
});

autoUpdater.on('download-progress', (progress) => {
  downloadProgressReceived = true;
  Logger.info(`Update download: ${Math.round(progress.percent)}% (${progress.transferred}/${progress.total})`);
});

autoUpdater.on('error', (err) => {
  Logger.error('Auto-updater error:', err.message);
});

// Native Squirrel updater events (macOS)
nativeUpdater.on('checking-for-update', () => Logger.info('Native updater: checking-for-update'));
nativeUpdater.on('update-available', () => Logger.info('Native updater: update-available'));
nativeUpdater.on('update-not-available', () => Logger.info('Native updater: update-not-available'));
nativeUpdater.on('update-downloaded', () => Logger.info('Native updater: update-downloaded'));
nativeUpdater.on('before-quit-for-update', () => Logger.info('Native updater: before-quit-for-update'));
nativeUpdater.on('error', (err) => Logger.error('Native updater error:', err.message));

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

  // Check for updates on startup (only if enabled in config and packaged)
  if (!app.isPackaged) {
    Logger.info('Skipping update check in development');
  } else {
    const config = configManager.loadConfig();
    if (config.autoUpdateEnabled) {
      Logger.info('Will check for updates in 3 seconds');
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => Logger.error('Update check failed:', err));
      }, 3000);
    } else {
      Logger.info('Auto-update disabled in config, skipping update check');
    }
  }
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

// Handle load-data: full data pipeline (scan → parse → build → return UnifiedDataset)
ipcMain.handle(
  'load-data',
  handleIpcError(async () => {
    Logger.info('IPC: load-data');
    const result = await loadData(profileDir);
    Logger.info(`IPC: load-data complete — ${result ? `${Object.keys(result.unified?.scouts || {}).length} scouts` : 'no data'}`);
    return result;
  })
);

// Handle save file (for unified dataset caching — saves to current/)
ipcMain.handle(
  'save-file',
  handleIpcError(async (_event: Electron.IpcMainInvokeEvent, { filename, content }: { filename: string; content: string }) => {
    const currentDir = path.join(profileDir, 'current');
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

    Logger.info('IPC: scrape-websites — starting sync');
    // Initialize scraper orchestrator with long-lived sessions
    const scraper = new ScraperOrchestrator(profileDir, seasonalData, boothCache, scSession, dcSession);
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

    // Persist per-endpoint sync metadata for restart survival
    const ts = loadTimestamps();
    for (const [ep, info] of Object.entries(results.endpointStatuses)) {
      ts.endpoints[ep] = {
        lastSync: info.lastSync || null,
        status: info.status,
        durationMs: info.durationMs,
        dataSize: info.dataSize,
        httpStatus: info.httpStatus,
        error: info.error
      };
    }
    saveTimestamps(ts);

    Logger.info('IPC: scrape-websites — sync complete', Object.keys(results.endpointStatuses));
    activeOrchestrator = null;
    return results;
  })
);

// Handle cancel sync
ipcMain.handle(
  'cancel-sync',
  handleIpcError(async () => {
    Logger.info('IPC: cancel-sync');
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
  handleIpcError(async (event) => {
    Logger.info('IPC: refresh-booth-locations');
    const config = configManager.loadConfig();
    if (!config.availableBoothsEnabled) return [];

    const progressCallback = (progress: import('./types').ScrapeProgress) => event.sender.send('scrape-progress', progress);

    await ensureSCSession();
    const scraper = new SmartCookieScraper(profileDir, null, scSession);

    // Track catalog fetch with timing/size — skip cache on manual refresh
    progressCallback({ endpoint: 'sc-booth-catalog', status: 'syncing' });
    const catalogStart = Date.now();
    const catalog = await scraper.fetchBoothCatalog();
    if (boothCache) boothCache.setCatalog(catalog);
    progressCallback({
      endpoint: 'sc-booth-catalog',
      status: 'synced',
      durationMs: Date.now() - catalogStart,
      dataSize: JSON.stringify(catalog).length
    });

    // Track availability fetch with timing/size
    progressCallback({ endpoint: 'sc-booth-availability', status: 'syncing' });
    const availStart = Date.now();
    const boothLocations = await scraper.fetchBoothAvailability(config.boothIds, catalog);
    progressCallback({
      endpoint: 'sc-booth-availability',
      status: 'synced',
      durationMs: Date.now() - availStart,
      dataSize: JSON.stringify(boothLocations).length
    });

    // Persist enriched booth locations to disk for the pipeline
    if (boothLocations.length > 0 && config.boothIds.length > 0) {
      savePipelineFile(profileDir, PIPELINE_FILES.SC_BOOTH_LOCATIONS, boothLocations);
    }

    // Persist booth sync metadata
    const ts = loadTimestamps();
    const now = new Date().toISOString();
    ts.endpoints['sc-booth-catalog'] = { lastSync: now, status: 'synced' };
    ts.endpoints['sc-booth-availability'] = { lastSync: now, status: 'synced' };
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
    const scraper = new SmartCookieScraper(profileDir, null, scSession);
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
    const credPath = path.join(rootDataDir, 'credentials.enc');
    if (fs.existsSync(credPath)) fs.unlinkSync(credPath);
  })
);

ipcMain.handle(
  'wipe-data',
  handleIpcError(async () => {
    // Keep only login-related files (seasonal data used for verification)
    const KEEP_FILES = new Set(['sc-troop.json', 'sc-cookies.json', 'dc-roles.json']);
    if (fs.existsSync(profileDir)) {
      for (const entry of fs.readdirSync(profileDir)) {
        if (KEEP_FILES.has(entry)) continue;
        const fullPath = path.join(profileDir, entry);
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
    Logger.info('IPC: quit-and-install — starting');
    Logger.info(`quit-and-install: platform=${process.platform}, downloadedFile=${downloadedUpdateFile}`);

    if (process.platform === 'darwin' && downloadedUpdateFile && fs.existsSync(downloadedUpdateFile)) {
      // Manual install: Squirrel.Mac's "The command is disabled" error means
      // quitAndInstall() can never work. Instead, extract the downloaded zip,
      // spawn a detached script to replace the app bundle, and exit.
      const currentAppPath = app.getAppPath().replace(/\/Contents\/Resources\/app(\.asar)?$/, '');
      Logger.info(`quit-and-install: manual install — currentApp=${currentAppPath}`);

      const tempDir = path.join(os.tmpdir(), 'cookie-tracker-update');
      try {
        // Extract the update zip
        Logger.info(`quit-and-install: extracting ${downloadedUpdateFile} to ${tempDir}`);
        execSync(`rm -rf "${tempDir}" && mkdir -p "${tempDir}" && ditto -xk "${downloadedUpdateFile}" "${tempDir}"`);

        // Find the .app bundle in the extracted dir
        const entries = fs.readdirSync(tempDir).filter((f) => f.endsWith('.app'));
        if (entries.length === 0) {
          Logger.error('quit-and-install: no .app found in extracted zip');
          throw new Error('No .app bundle found in update zip');
        }
        const newAppPath = path.join(tempDir, entries[0]);
        Logger.info(`quit-and-install: found ${entries[0]}, spawning update script`);

        // Spawn a detached shell script that waits for this process to exit,
        // replaces the app bundle, relaunches, and cleans up.
        const script = [
          `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.5; done`,
          `rm -rf "${currentAppPath}"`,
          `mv "${newAppPath}" "${currentAppPath}"`,
          `open "${currentAppPath}"`,
          `rm -rf "${tempDir}"`
        ].join(' && ');

        spawn('bash', ['-c', script], { detached: true, stdio: 'ignore' }).unref();
        Logger.info('quit-and-install: update script spawned, exiting app');
        Logger.close();
        app.exit(0);
      } catch (err) {
        Logger.error('quit-and-install: manual install failed:', err);
        // Fall through to Squirrel attempt
      }
    }

    // Non-macOS or manual install failed: try Squirrel/standard approach
    Logger.info('quit-and-install: trying standard quitAndInstall()');
    app.removeAllListeners('window-all-closed');
    app.removeAllListeners('activate');
    if (mainWindow) mainWindow.removeAllListeners('close');

    nativeUpdater.once('before-quit-for-update', () => {
      Logger.info('quit-and-install: before-quit-for-update fired, calling app.exit()');
      app.exit();
    });

    autoUpdater.quitAndInstall();

    // Fallback: force exit after 5s if nothing happened
    setTimeout(() => {
      Logger.info('quit-and-install: fallback timeout, calling app.exit(0)');
      app.exit(0);
    }, 5000);
  })
);

ipcMain.handle(
  'check-for-updates',
  handleIpcError(async () => {
    if (app.isPackaged && configManager.loadConfig().autoUpdateEnabled) {
      autoUpdater.checkForUpdates().catch((err) => Logger.error('Update check failed:', err));
    }
  })
);

// Handle send iMessage via AppleScript
ipcMain.handle(
  'send-imessage',
  handleIpcError(async (_event: Electron.IpcMainInvokeEvent, { recipient, message }: { recipient: string; message: string }) => {
    Logger.info(`IPC: send-imessage to ${recipient}`);
    const escapedMessage = message.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const escapedRecipient = recipient.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const script = `tell application "Messages"
  send "${escapedMessage}" to buddy "${escapedRecipient}" of (service 1 whose service type is iMessage)
end tell`;
    await new Promise<void>((resolve, reject) => {
      execFile('osascript', ['-e', script], (error) => {
        if (error) {
          Logger.error('iMessage send failed:', error.message);
          reject(error);
        } else {
          Logger.info('iMessage sent successfully');
          resolve();
        }
      });
    });
  })
);

// Handle export data zip (exports current profile)
ipcMain.handle(
  'export-data',
  handleIpcError(async () => {
    if (!mainWindow) throw new Error('No main window');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    // Electron type defs resolve showSaveDialog overload incorrectly with BrowserWindow
    const showSave: (w: BrowserWindow, o: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue> =
      dialog.showSaveDialog.bind(dialog);
    const saveResult = await showSave(mainWindow, {
      defaultPath: `cookie-tracker-export-${timestamp}.zip`,
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

    // Add everything in profileDir except credentials
    if (fs.existsSync(profileDir)) {
      for (const entry of fs.readdirSync(profileDir)) {
        if (EXCLUDED_FILES.has(entry)) continue;
        const fullPath = path.join(profileDir, entry);
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

// ============================================================================
// PROFILE IPC HANDLERS
// ============================================================================

ipcMain.handle(
  'load-profiles',
  handleIpcError(async () => {
    return profileManager.loadProfiles();
  })
);

ipcMain.handle(
  'switch-profile',
  handleIpcError(async (_event: Electron.IpcMainInvokeEvent, { dirName }: { dirName: string }) => {
    Logger.info(`IPC: switch-profile to ${dirName}`);
    // Cancel any active sync
    if (activeOrchestrator) {
      activeOrchestrator.cancel();
      activeOrchestrator = null;
    }
    const result = profileManager.switchProfile(dirName);
    initializeProfileManagers(result.profileDir);
    return result.config;
  })
);

ipcMain.handle(
  'delete-profile',
  handleIpcError(async (_event: Electron.IpcMainInvokeEvent, { dirName }: { dirName: string }) => {
    Logger.info(`IPC: delete-profile ${dirName}`);
    const wasActive = profileManager.loadProfiles().activeProfile === dirName;
    const config = profileManager.deleteProfile(dirName);
    if (wasActive) {
      initializeProfileManagers(path.join(rootDataDir, 'default'));
    }
    return config;
  })
);

ipcMain.handle(
  'import-profile',
  handleIpcError(async (_event: Electron.IpcMainInvokeEvent, { name }: { name: string }) => {
    if (!mainWindow) throw new Error('No main window');
    Logger.info(`IPC: import-profile "${name}"`);

    const showOpen: (w: BrowserWindow, o: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue> =
      dialog.showOpenDialog.bind(dialog);
    const openResult = await showOpen(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Zip Archives', extensions: ['zip'] }]
    });

    if (openResult.canceled || openResult.filePaths.length === 0) return null;
    const zipPath = openResult.filePaths[0];

    const { profile, config } = profileManager.createProfile(name);
    const newProfileDir = path.join(rootDataDir, profile.dirName);

    // Extract ZIP into the new profile directory
    await new Promise<void>((resolve, reject) => {
      execFile('ditto', ['-xk', zipPath, newProfileDir], (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    // Remove credentials if they were included in the ZIP (security)
    const credInZip = path.join(newProfileDir, 'credentials.enc');
    if (fs.existsSync(credInZip)) fs.unlinkSync(credInZip);

    return config;
  })
);
