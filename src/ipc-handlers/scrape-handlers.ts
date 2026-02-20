import { ipcMain } from 'electron';
import { PIPELINE_FILES } from '../constants';
import { normalizeBoothLocation } from '../data-processing/importers';
import Logger from '../logger';
import ScraperOrchestrator from '../scrapers';
import { savePipelineFile } from '../scrapers/base-scraper';
import SmartCookieScraper from '../scrapers/smart-cookie';
import type { Credentials, ScrapeProgress } from '../types';
import type { HandlerDeps } from './types';

function loadAndValidateCredentials(
  deps: HandlerDeps
): { credentials: Credentials; error?: undefined } | { credentials?: undefined; error: string } {
  const credentials = deps.credentialsManager.loadCredentials();
  const validation = deps.credentialsManager.validateCredentials(credentials);
  if (!validation.valid) {
    return { error: validation.error || 'Invalid credentials' };
  }
  return { credentials };
}

/** Ensure the long-lived SC session is authenticated, logging in if needed */
async function ensureSCSession(deps: HandlerDeps): Promise<void> {
  if (deps.scSession.isAuthenticated) return;
  const credentials = deps.credentialsManager.loadCredentials();
  if (!credentials?.smartCookie?.username || !credentials?.smartCookie?.password) {
    throw new Error('No Smart Cookie credentials configured. Please set up logins first.');
  }
  await deps.scSession.login(credentials.smartCookie.username, credentials.smartCookie.password);
}

export function registerScrapeHandlers(deps: HandlerDeps): void {
  const {
    profileDir,
    profileReadOnly,
    configManager,
    seasonalData,
    boothCache,
    scSession,
    dcSession,
    activeOrchestrator,
    loadTimestamps,
    saveTimestamps,
    handleIpcError
  } = deps;

  // Handle scrape websites
  ipcMain.handle(
    'scrape-websites',
    handleIpcError(async (event) => {
      if (profileReadOnly()) throw new Error('Syncing is disabled for imported profiles');
      if (activeOrchestrator.get()) throw new Error('Sync already in progress');
      const auth = loadAndValidateCredentials(deps);
      if (auth.error || !auth.credentials) {
        throw new Error(auth.error || 'No credentials available');
      }

      Logger.info('IPC: scrape-websites — starting sync');
      // Initialize scraper orchestrator with long-lived sessions
      const scraper = new ScraperOrchestrator(profileDir(), seasonalData(), boothCache(), scSession, dcSession);
      activeOrchestrator.set(scraper);

      try {
        // Set up progress callback
        scraper.setProgressCallback((progress) => {
          event.sender.send('scrape-progress', progress);
        });

        // Small delay to ensure renderer's progress listener is fully registered
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Run scraping (pass configured booth IDs)
        const config = configManager().loadConfig();
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
        return results;
      } finally {
        activeOrchestrator.set(null);
      }
    })
  );

  // Handle booth locations refresh (re-fetch just booth availability without full sync)
  // Uses long-lived SC session, logging in if needed
  ipcMain.handle(
    'refresh-booth-locations',
    handleIpcError(async (event) => {
      if (profileReadOnly()) return [];
      Logger.info('IPC: refresh-booth-locations');
      const config = configManager().loadConfig();
      if (!config.availableBoothsEnabled) return [];

      const progressCallback = (progress: ScrapeProgress) => event.sender.send('scrape-progress', progress);

      await ensureSCSession(deps);
      const scraper = new SmartCookieScraper(profileDir(), null, scSession);

      // Track catalog fetch with timing/size — skip cache on manual refresh
      progressCallback({ endpoint: 'sc-booth-catalog', status: 'syncing' });
      const catalogStart = Date.now();
      const catalog = await scraper.fetchBoothCatalog();
      if (boothCache()) boothCache().setCatalog(catalog);
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
        savePipelineFile(profileDir(), PIPELINE_FILES.SC_BOOTH_LOCATIONS, boothLocations);
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
      const config = configManager().loadConfig();
      if (!config.availableBoothsEnabled) return [];

      await ensureSCSession(deps);
      const scraper = new SmartCookieScraper(profileDir(), null, scSession);
      const catalog = await scraper.fetchBoothCatalog(boothCache());
      return catalog.map(normalizeBoothLocation);
    })
  );
}
