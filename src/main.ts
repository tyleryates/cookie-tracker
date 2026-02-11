import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import ConfigManager from './config-manager';
import CredentialsManager from './credentials-manager';
import Logger from './logger';
import ScraperOrchestrator from './scrapers';
import SmartCookieScraper from './scrapers/smart-cookie';
import type { AppConfig, Credentials } from './types';

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

// Standardized IPC error handler wrapper
function handleIpcError(handler: (...args: any[]) => Promise<any>): (...args: any[]) => Promise<any> {
  return async (...args) => {
    try {
      const result = await handler(...args);
      // If handler returns explicit success/error format, use it
      if (result && typeof result === 'object' && 'success' in result) {
        return result;
      }
      // Otherwise wrap successful result
      return { success: true, data: result };
    } catch (error) {
      Logger.error('IPC Handler Error:', error);
      return {
        success: false,
        error: error.message
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
    const fileGroups = {
      'unified-': [],
      'SC-': [],
      'DC-': []
    };

    files.forEach((filename) => {
      const filePath = path.join(directory, filename);
      const stats = fs.statSync(filePath);

      if (!stats.isFile()) return;

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
    });

    // For each file type, keep only the N most recent
    let totalDeleted = 0;
    Object.entries(fileGroups).forEach(([_prefix, fileList]) => {
      if (fileList.length <= keepCount) {
        return;
      }

      fileList.sort((a, b) => b.mtime - a.mtime);
      const filesToDelete = fileList.slice(keepCount);
      filesToDelete.forEach((file) => {
        try {
          fs.unlinkSync(file.path);
          totalDeleted++;
          Logger.debug(`Deleted old data file: ${file.name}`);
        } catch (err) {
          Logger.error(`Failed to delete ${file.name}:`, err.message);
        }
      });
    });

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
      nodeIntegration: true,
      contextIsolation: false
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
  mainWindow.webContents.send('update-available', info);
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

// Handle scan and import from 'in' directory
ipcMain.handle(
  'scan-in-directory',
  handleIpcError(async () => {
    const inDir = path.join(dataDir, 'in');

    // Create directory if it doesn't exist
    if (!fs.existsSync(inDir)) {
      fs.mkdirSync(inDir, { recursive: true });
    }

    // Find all supported files
    const files = fs.readdirSync(inDir).filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return ['.xlsx', '.xls', '.csv', '.json'].includes(ext);
    });

    if (files.length === 0) {
      return {
        success: false,
        message: 'No files found in /data/in/ directory'
      };
    }

    const fileData = [];
    for (const file of files) {
      const filePath = path.join(inDir, file);
      const ext = path.extname(file).toLowerCase();
      const stats = fs.statSync(filePath);

      // Read JSON files as parsed objects, binary files as buffers
      let data: any;
      if (ext === '.json') {
        const jsonStr = fs.readFileSync(filePath, 'utf8');
        data = JSON.parse(jsonStr);
      } else {
        data = fs.readFileSync(filePath);
      }

      fileData.push({
        name: file,
        path: filePath,
        data: data,
        extension: ext
      });
    }

    return {
      success: true,
      files: fileData
    };
  })
);

// Handle save file (for unified dataset caching)
ipcMain.handle(
  'save-file',
  handleIpcError(async (_event, { filename, content, type: _type }) => {
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
    const credentials = credentialsManager.loadCredentials();
    return {
      success: true,
      credentials: credentials
    };
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
    return { success: true };
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
    if (auth.error) {
      return { success: false, error: auth.error };
    }

    // Initialize scraper orchestrator (use userData path)
    const scraper = new ScraperOrchestrator(dataDir);

    // Set up progress callback
    scraper.setProgressCallback((progress: { status: string; progress: number }) => {
      event.sender.send('scrape-progress', progress);
    });

    // Small delay to ensure renderer's progress listener is fully registered
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Run scraping (pass configured booth IDs)
    const config = configManager.loadConfig();
    const results = await scraper.scrapeAll(auth.credentials, config.boothIds);

    // Persist scraper for on-demand booth API calls
    if (results.success) {
      lastScraper = scraper;
    }

    return results;
  })
);

// Handle booth locations refresh (re-fetch just booth availability without full sync)
// If no active session, logs in fresh using saved credentials
ipcMain.handle(
  'refresh-booth-locations',
  handleIpcError(async () => {
    let scraper = lastScraper?.getSmartCookieScraper();

    if (!scraper) {
      // No active session — try to login with saved credentials
      const credentials = credentialsManager.loadCredentials();
      if (!credentials?.smartCookie?.username || !credentials?.smartCookie?.password) {
        return { success: false, error: 'No Smart Cookie credentials configured. Please set up logins first.' };
      }

      scraper = new SmartCookieScraper(dataDir);
      await scraper.login(credentials.smartCookie.username, credentials.smartCookie.password);
    }

    const config = configManager.loadConfig();
    const boothLocations = await scraper.fetchBoothLocations(config.boothIds);
    return { success: true, data: boothLocations };
  })
);
