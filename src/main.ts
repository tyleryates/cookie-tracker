import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import ConfigManager from './config-manager';
import CredentialsManager from './credentials-manager';
import { loadData } from './data-pipeline';
import { normalizeBoothLocation } from './data-processing/importers';
import Logger from './logger';
import ScraperOrchestrator from './scrapers';
import SmartCookieScraper from './scrapers/smart-cookie';
import type { AppConfig, Credentials, DataFileInfo, IpcResponse } from './types';

let mainWindow: BrowserWindow | null = null;
let lastScraper: ScraperOrchestrator | null = null;

// Use app.getPath('userData') for data storage (works with packaged app)
// Production (packaged): ~/Library/Application Support/Cookie Tracker on macOS (uses productName)
// Development (npm start): ~/Library/Application Support/cookie-tracker on macOS (uses name)
// Windows production: %APPDATA%/Cookie Tracker
// Windows development: %APPDATA%/cookie-tracker
const userDataPath = app.getPath('userData');
const dataDir = path.join(userDataPath, 'data');

const credentialsManager = new CredentialsManager(dataDir);
const configManager = new ConfigManager(dataDir);

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

/**
 * Clean up old data files, keeping only the most recent N files of each type
 */
function cleanupOldDataFiles(directory: string, keepCount: number = 10): void {
  try {
    if (!fs.existsSync(directory)) {
      return;
    }

    const files = fs.readdirSync(directory);

    // Group files by type (prefix)
    const fileGroups: Record<string, Array<{ name: string; path: string; mtime: number }>> = {
      'unified-': [],
      'SC-': [],
      'DC-': []
    };

    for (const filename of files) {
      const filePath = path.join(directory, filename);
      const stats = fs.statSync(filePath);

      if (!stats.isFile()) continue;

      for (const prefix of Object.keys(fileGroups)) {
        if (filename.startsWith(prefix)) {
          fileGroups[prefix].push({
            name: filename,
            path: filePath,
            mtime: stats.mtime.getTime()
          });
          break;
        }
      }
    }

    // For each file type, keep only the N most recent
    let totalDeleted = 0;
    for (const [, fileList] of Object.entries(fileGroups)) {
      if (fileList.length <= keepCount) {
        continue;
      }

      fileList.sort((a, b) => b.mtime - a.mtime);
      const filesToDelete = fileList.slice(keepCount);
      for (const file of filesToDelete) {
        try {
          fs.unlinkSync(file.path);
          totalDeleted++;
          Logger.debug(`Deleted old data file: ${file.name}`);
        } catch (err) {
          Logger.error(`Failed to delete ${file.name}:`, (err as Error).message);
        }
      }
    }

    if (totalDeleted > 0) {
      Logger.info(`Cleaned up ${totalDeleted} old data file(s), keeping ${keepCount} most recent of each type`);
    }
  } catch (error) {
    Logger.error('Error during data file cleanup:', error);
  }
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

  // Open DevTools for debugging (uncomment if needed)
  // mainWindow.webContents.openDevTools();
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

  // Clean up old data files on startup
  const inDir = path.join(dataDir, 'in');
  cleanupOldDataFiles(inDir, 10);

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
  handleIpcError(async (_event, options?: { specificSc?: DataFileInfo | null; specificDc?: DataFileInfo | null }) => {
    const inDir = path.join(dataDir, 'in');
    const result = await loadData(inDir, options);
    return result;
  })
);

// Handle save file (for unified dataset caching)
ipcMain.handle(
  'save-file',
  handleIpcError(async (_event, { filename, content }) => {
    const inDir = path.join(dataDir, 'in');

    // Create directory if it doesn't exist
    if (!fs.existsSync(inDir)) {
      fs.mkdirSync(inDir, { recursive: true });
    }

    // Sanitize filename to prevent path traversal
    const sanitizedFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');

    // Validate filename
    if (!sanitizedFilename || sanitizedFilename.startsWith('.')) {
      throw new Error('Invalid filename provided');
    }

    const filePath = path.join(inDir, sanitizedFilename);

    // Verify the resolved path is within the intended directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(inDir);
    // Check works on both Unix (/) and Windows (\) path separators
    if (!resolvedPath.startsWith(resolvedDir + path.sep) && resolvedPath !== resolvedDir) {
      throw new Error('Path traversal attempt detected');
    }

    fs.writeFileSync(filePath, content, 'utf8');

    // Clean up old files after saving (keep 10 most recent of each type)
    cleanupOldDataFiles(inDir, 10);

    return {
      path: filePath
    };
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

    // Initialize scraper orchestrator (use userData path)
    const scraper = new ScraperOrchestrator(dataDir);

    // Set up progress callback
    scraper.setProgressCallback((progress) => {
      event.sender.send('scrape-progress', progress);
    });

    // Small delay to ensure renderer's progress listener is fully registered
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Run scraping (pass configured booth IDs)
    const config = configManager.loadConfig();
    const results = await scraper.scrapeAll(auth.credentials, config.boothIds);

    // Persist scraper for on-demand booth API calls and cancellation
    lastScraper = scraper;

    return results;
  })
);

// Handle cancel sync
ipcMain.handle(
  'cancel-sync',
  handleIpcError(async () => {
    if (lastScraper) {
      lastScraper.cancel();
    }
  })
);

// Handle booth locations refresh (re-fetch just booth availability without full sync)
// Uses existing SC session if available, otherwise logs in fresh
ipcMain.handle(
  'refresh-booth-locations',
  handleIpcError(async () => {
    // Try to reuse existing session from last scrape
    let scraper = lastScraper?.getSmartCookieScraper();

    if (!scraper || !scraper.session.isAuthenticated) {
      // No active session — create fresh scraper and login
      const credentials = credentialsManager.loadCredentials();
      if (!credentials?.smartCookie?.username || !credentials?.smartCookie?.password) {
        throw new Error('No Smart Cookie credentials configured. Please set up logins first.');
      }

      scraper = new SmartCookieScraper(dataDir);
      await scraper.session.login(credentials.smartCookie.username, credentials.smartCookie.password);
    }

    const config = configManager.loadConfig();
    const boothLocations = await scraper.fetchBoothLocations(config.boothIds);
    return boothLocations.map(normalizeBoothLocation);
  })
);

// Fetch ALL booth locations (no availability) for the booth selector UI
ipcMain.handle(
  'fetch-booth-catalog',
  handleIpcError(async () => {
    let scraper = lastScraper?.getSmartCookieScraper();

    if (!scraper || !scraper.session.isAuthenticated) {
      const credentials = credentialsManager.loadCredentials();
      if (!credentials?.smartCookie?.username || !credentials?.smartCookie?.password) {
        throw new Error('No Smart Cookie credentials configured. Please set up logins first.');
      }

      scraper = new SmartCookieScraper(dataDir);
      await scraper.session.login(credentials.smartCookie.username, credentials.smartCookie.password);
    }

    const boothLocations = await scraper.fetchBoothLocations([]);
    return boothLocations.map(normalizeBoothLocation);
  })
);
