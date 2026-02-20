// Data Pipeline — runs in main process.
// Reads pipeline files from current/, legacy manual files from data/in/.
// Passes individual pieces directly to importers, then builds UnifiedDataset.

import * as fs from 'node:fs';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import { DC_COLUMNS, PIPELINE_FILES, WARNING_TYPE } from './constants';
import { buildUnifiedDataset } from './data-processing/calculators/index';
import type { AllocationData } from './data-processing/importers';
import {
  importAllocations,
  importDigitalCookie,
  importFinancePayments,
  importSmartCookie,
  importSmartCookieOrders,
  importSmartCookieReport
} from './data-processing/importers';
import { createDataStore, type ReadonlyDataStore } from './data-store';
import Logger from './logger';
import type {
  SCBoothDividerResult,
  SCBoothLocationRaw,
  SCDirectShipDivider,
  SCFinanceTransaction,
  SCMeResponse,
  SCOrdersResponse,
  SCReservationsResponse,
  SCVirtualCookieShare
} from './scrapers/sc-types';
import type { CookieType, DataFileInfo, LoadDataResult, LoadedSources, RawDataRow } from './types';
import { validateDCData, validateSCOrders } from './validators';

// ============================================================================
// EXCEL PARSING
// ============================================================================

/** Convert an ExcelJS cell value to a string, matching xlsx's { raw: false } behavior. */
function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) {
    // Format dates as MM/DD/YYYY to match xlsx raw:false output
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${m}/${d}/${value.getFullYear()}`;
  }
  if (typeof value === 'object' && 'richText' in value) {
    return (value as ExcelJS.CellRichTextValue).richText.map((rt) => rt.text).join('');
  }
  if (typeof value === 'object' && 'error' in value) return '';
  if (typeof value === 'object' && 'result' in value) {
    return cellToString((value as ExcelJS.CellFormulaValue).result);
  }
  return String(value);
}

async function parseExcel(buffer: Buffer): Promise<RawDataRow[]> {
  const workbook = new ExcelJS.Workbook();
  // Cast needed: ExcelJS types expect old Buffer, TS 5.9+ infers Buffer<ArrayBufferLike>
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headers: string[] = [];
  const rows: RawDataRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell, colNumber) => {
        headers[colNumber - 1] = cellToString(cell.value);
      });
    } else {
      const obj: RawDataRow = {};
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header) {
          obj[header] = cellToString(cell.value);
        }
      });
      if (Object.keys(obj).length > 0) {
        rows.push(obj);
      }
    }
  });

  return rows;
}

// ============================================================================
// FORMAT VALIDATORS
// ============================================================================

function isDigitalCookieFormat(data: RawDataRow[]): boolean {
  if (!data || data.length === 0) return false;
  const headers = Object.keys(data[0]);
  return headers.includes(DC_COLUMNS.GIRL_FIRST_NAME) && headers.includes(DC_COLUMNS.ORDER_NUMBER);
}

// ============================================================================
// PIPELINE FILE READING
// ============================================================================

const isObject = (d: unknown): boolean => typeof d === 'object' && d !== null && !Array.isArray(d);
const isArray = (d: unknown): boolean => Array.isArray(d);

/** Read a pipeline file from current/ as raw JSON. Optional shape validator rejects corrupted data. */
function readPipelineFile<T>(currentDir: string, filename: string, validate?: (data: unknown) => boolean): T | null {
  const filePath = path.join(currentDir, filename);
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (validate && !validate(data)) {
      Logger.warn(`Pipeline file ${filename}: unexpected shape, skipping`);
      return null;
    }
    return data as T;
  } catch (err) {
    Logger.error(`Failed to parse pipeline file ${filename}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ============================================================================
// LEGACY FILE SCANNING (data/in/ for manual imports)
// ============================================================================

function scanLegacyFiles(inDir: string): DataFileInfo[] {
  if (!fs.existsSync(inDir)) return [];

  const fileNames = fs.readdirSync(inDir).filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return ['.xlsx', '.xls', '.csv'].includes(ext);
  });

  const files: DataFileInfo[] = [];
  for (const name of fileNames) {
    const filePath = path.join(inDir, name);
    const ext = path.extname(name).toLowerCase();
    files.push({ name, path: filePath, data: fs.readFileSync(filePath), extension: ext });
  }

  return files;
}

function findFileByIncludes(files: DataFileInfo[], nameIncludes: string, extension: string): DataFileInfo | null {
  return files.find((f) => f.extension === extension && f.name.includes(nameIncludes)) ?? null;
}

// ============================================================================
// DATA LOADING
// ============================================================================

type FileLoadResult = { loaded: boolean; issue?: string };

async function loadExcelFile(
  file: DataFileInfo,
  validator: (data: RawDataRow[]) => boolean,
  importer: (data: RawDataRow[]) => void,
  errorLabel: string
): Promise<FileLoadResult> {
  const parsedData = await parseExcel(file.data as Buffer);
  if (validator(parsedData)) {
    importer(parsedData);
    return { loaded: true };
  }
  return { loaded: false, issue: `${errorLabel}: ${file.name}` };
}

// ============================================================================
// ALLOCATION DATA LOADING
// ============================================================================

/** Read all allocation-related pipeline files from current/ into an AllocationData bundle */
function readAllocationData(currentDir: string): AllocationData {
  const cookieSharesKeyed = readPipelineFile<Record<string, SCVirtualCookieShare>>(currentDir, PIPELINE_FILES.SC_COOKIE_SHARES, isObject);
  const boothDividersKeyed = readPipelineFile<Record<string, SCBoothDividerResult>>(
    currentDir,
    PIPELINE_FILES.SC_BOOTH_ALLOCATIONS,
    isObject
  );

  return {
    directShipDivider: readPipelineFile<SCDirectShipDivider>(currentDir, PIPELINE_FILES.SC_DIRECT_SHIP, isObject) ?? null,
    virtualCookieShares: cookieSharesKeyed ? Object.values(cookieSharesKeyed) : [],
    reservations: readPipelineFile<SCReservationsResponse>(currentDir, PIPELINE_FILES.SC_RESERVATIONS, isObject) ?? null,
    boothDividers: boothDividersKeyed ? Object.values(boothDividersKeyed) : [],
    boothLocations: readPipelineFile<SCBoothLocationRaw[]>(currentDir, PIPELINE_FILES.SC_BOOTH_LOCATIONS, isArray) ?? [],
    cookieIdMap: readPipelineFile<Record<string, CookieType>>(currentDir, PIPELINE_FILES.SC_COOKIE_ID_MAP, isObject) ?? null
  };
}

// ============================================================================
// IMPORT PHASE HELPERS
// ============================================================================

/** Pre-set troop identity from seasonal data (sc-troop.json) so T2T direction is known during import.
 *  troop_id is an internal SC database ID; troop_name is the human-readable name (e.g. "Troop 3990").
 *  Both are needed because the from/to fields in orders may match either format. */
function loadTroopIdentity(store: ReturnType<typeof createDataStore>, dataDir: string): void {
  const troopData = readPipelineFile<SCMeResponse>(dataDir, 'sc-troop.json', isObject);
  if (troopData?.role?.troop_id) {
    store.troopNumber = String(troopData.role.troop_id);
  }
  if (troopData?.role?.troop_name) {
    store.troopName = String(troopData.role.troop_name);
  }
}

/** Load Smart Cookie API data from current/ pipeline files (orders, allocations, finance). */
function loadSmartCookieData(store: ReturnType<typeof createDataStore>, currentDir: string, loaded: LoadedSources): void {
  const ordersData = readPipelineFile<SCOrdersResponse>(currentDir, PIPELINE_FILES.SC_ORDERS, isObject);
  if (ordersData?.orders) {
    const validation = validateSCOrders(ordersData);
    if (!validation.valid) {
      Logger.warn('SC orders validation issues:', validation.issues);
    }
    importSmartCookieOrders(store, ordersData);

    importAllocations(store, readAllocationData(currentDir));

    const financeRaw = readPipelineFile<SCFinanceTransaction[]>(currentDir, PIPELINE_FILES.SC_FINANCE, isArray);
    if (financeRaw) importFinancePayments(store, financeRaw);

    loaded.sc = true;
  }
}

/** Load Digital Cookie export from current/dc-export.xlsx. */
async function loadDigitalCookieData(store: ReturnType<typeof createDataStore>, currentDir: string, loaded: LoadedSources): Promise<void> {
  const dcExportPath = path.join(currentDir, PIPELINE_FILES.DC_EXPORT);
  if (fs.existsSync(dcExportPath)) {
    const buffer = fs.readFileSync(dcExportPath);
    const parsedData = await parseExcel(buffer);
    if (isDigitalCookieFormat(parsedData)) {
      const validation = validateDCData(parsedData);
      if (!validation.valid) {
        Logger.warn('DC data validation issues:', validation.issues);
      }
      importDigitalCookie(store, parsedData);
      loaded.dc = true;
    } else {
      loaded.issues.push('Digital Cookie export not recognized');
    }
  }
}

/** Load legacy manual files from data/in/ (SC Report exports, transfer exports). */
async function loadLegacyFiles(store: ReturnType<typeof createDataStore>, inDir: string, loaded: LoadedSources): Promise<void> {
  const legacyFiles = scanLegacyFiles(inDir);

  const scReportFile = findFileByIncludes(legacyFiles, 'ReportExport', '.xlsx');
  if (scReportFile) {
    const r = await loadExcelFile(
      scReportFile,
      (data) => data?.length > 0,
      (data) => importSmartCookieReport(store, data),
      'Smart Cookie Report empty/unreadable'
    );
    loaded.scReport = r.loaded;
    if (r.issue) loaded.issues.push(r.issue);
  }

  const scTransferFile = findFileByIncludes(legacyFiles, 'CookieOrders', '.xlsx');
  if (!loaded.sc && scTransferFile) {
    const r = await loadExcelFile(
      scTransferFile,
      (data) => data?.length > 0,
      (data) => importSmartCookie(store, data),
      'Smart Cookie Transfer empty/unreadable'
    );
    loaded.scTransfer = r.loaded;
    if (r.issue) loaded.issues.push(r.issue);
  } else if (loaded.sc && scTransferFile) {
    store.metadata.warnings.push({ type: WARNING_TYPE.SC_TRANSFER_SKIPPED, reason: 'SC API data present', file: scTransferFile.name });
    Logger.warn('Skipping CookieOrders.xlsx import because SC API data is present.');
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Load and build unified dataset from files on disk.
 * Reads sync data from sync/ (API responses, DC export) and
 * legacy manual files from data/in/ (ReportExport, CookieOrders).
 */
export async function loadData(dataDir: string): Promise<LoadDataResult | null> {
  const currentDir = path.join(dataDir, 'sync');
  const inDir = path.join(dataDir, 'in');

  const store = createDataStore();
  const loaded: LoadedSources = { sc: false, dc: false, scReport: false, scTransfer: false, issues: [] };

  loadTroopIdentity(store, dataDir);
  loadSmartCookieData(store, currentDir, loaded);
  await loadDigitalCookieData(store, currentDir, loaded);
  await loadLegacyFiles(store, inDir, loaded);

  const anyLoaded = loaded.sc || loaded.dc || loaded.scReport || loaded.scTransfer;
  if (!anyLoaded) return null;

  Logger.debug('Building unified dataset...');
  const frozenStore: ReadonlyDataStore = store;
  const unified = buildUnifiedDataset(frozenStore);

  if (unified.metadata?.healthChecks?.warningsCount > 0) {
    Logger.warn('Health check warnings:', unified.warnings);
  }
  Logger.info('Unified dataset ready:', { scouts: Object.keys(unified.scouts).length });

  return { unified, loaded };
}
