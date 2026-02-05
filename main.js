const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const CredentialsManager = require('./credentials-manager');
const ScraperOrchestrator = require('./scrapers');
const { autoUpdater } = require('electron-updater');

let mainWindow;

// Use app.getPath('userData') for data storage (works with packaged app)
// Production (packaged): ~/Library/Application Support/Cookie Tracker on macOS (uses productName)
// Development (npm start): ~/Library/Application Support/cookie-tracker on macOS (uses name)
// Windows production: %APPDATA%/Cookie Tracker
// Windows development: %APPDATA%/cookie-tracker
const userDataPath = app.getPath('userData');
const dataDir = path.join(userDataPath, 'data');

const credentialsManager = new CredentialsManager(dataDir);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  // Open DevTools for debugging (uncomment if needed)
  // mainWindow.webContents.openDevTools();
}

// Auto-update configuration
autoUpdater.autoDownload = false; // Don't auto-download, ask user first

autoUpdater.on('update-available', (info) => {
  mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('update-downloaded', () => {
  mainWindow.webContents.send('update-downloaded');
});

autoUpdater.on('error', (err) => {
  console.error('Update error:', err);
});

// IPC handlers for update control
ipcMain.handle('download-update', async () => {
  await autoUpdater.downloadUpdate();
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

app.whenReady().then(() => {
  createWindow();

  // Check for updates (only in production)
  if (!app.isPackaged) {
    console.log('Skipping update check in development');
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
ipcMain.handle('scan-in-directory', async () => {
  const inDir = path.join(dataDir, 'in');

  // Create directory if it doesn't exist
  if (!fs.existsSync(inDir)) {
    fs.mkdirSync(inDir, { recursive: true });
  }

  // Find all supported files
  const files = fs.readdirSync(inDir).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.xlsx', '.xls', '.csv', '.json'].includes(ext);
  });

  if (files.length === 0) {
    return {
      success: false,
      message: 'No files found in /data/in/ directory'
    };
  }

  // Read all files
  const fileData = [];
  for (const file of files) {
    const filePath = path.join(inDir, file);
    const ext = path.extname(file).toLowerCase();

    // Read JSON files as parsed objects, binary files as buffers
    let data;
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
});

// Handle load credentials
ipcMain.handle('load-credentials', async () => {
  try {
    const credentials = credentialsManager.loadCredentials();
    return {
      success: true,
      credentials: credentials
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// Handle save credentials
ipcMain.handle('save-credentials', async (event, credentials) => {
  try {
    const result = credentialsManager.saveCredentials(credentials);
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// Handle scrape websites
ipcMain.handle('scrape-websites', async (event) => {
  try {
    // Load credentials
    const credentials = credentialsManager.loadCredentials();

    // Validate credentials exist
    const validation = credentialsManager.validateCredentials(credentials);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }

    // Initialize scraper orchestrator (use userData path)
    const scraper = new ScraperOrchestrator(dataDir);

    // Set up progress callback
    scraper.setProgressCallback((progress) => {
      event.sender.send('scrape-progress', progress);
    });

    // Run scraping
    const results = await scraper.scrapeAll(credentials);

    return results;

  } catch (error) {
    console.error('Scrape websites error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});
