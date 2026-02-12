// Data Pipeline — runs in main process.
// Scan → parse → import → build unified → return to renderer.

import * as fs from 'node:fs';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import { DC_COLUMNS } from './constants';
import { buildUnifiedDataset } from './data-processing/calculators/index';
import { importDigitalCookie, importSmartCookie, importSmartCookieAPI, importSmartCookieReport } from './data-processing/importers';
import { createDataStore, type DataStore, type ReadonlyDataStore } from './data-store';
import Logger from './logger';
import type { DataFileInfo, DatasetEntry, LoadDataResult, LoadedSources } from './types';
import { validateDCData, validateSCData } from './validators';

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

async function parseExcel(buffer: Buffer): Promise<Record<string, any>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headers: string[] = [];
  const rows: Record<string, any>[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell, colNumber) => {
        headers[colNumber - 1] = cellToString(cell.value);
      });
    } else {
      const obj: Record<string, any> = {};
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

function isDigitalCookieFormat(data: Record<string, any>[]): boolean {
  if (!data || data.length === 0) return false;
  const headers = Object.keys(data[0]);
  return headers.includes(DC_COLUMNS.GIRL_FIRST_NAME) && headers.includes(DC_COLUMNS.ORDER_NUMBER);
}

function isSmartCookieAPIFormat(data: Record<string, any>): boolean {
  return data?.orders && Array.isArray(data.orders);
}

// ============================================================================
// FILE SCANNING
// ============================================================================

function scanDataFiles(inDir: string): DataFileInfo[] {
  if (!fs.existsSync(inDir)) {
    fs.mkdirSync(inDir, { recursive: true });
  }

  const fileNames = fs.readdirSync(inDir).filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return ['.xlsx', '.xls', '.csv', '.json'].includes(ext);
  });

  const files: DataFileInfo[] = [];
  for (const name of fileNames) {
    const filePath = path.join(inDir, name);
    const ext = path.extname(name).toLowerCase();
    let data: any;
    if (ext === '.json') {
      const jsonStr = fs.readFileSync(filePath, 'utf8');
      data = JSON.parse(jsonStr);
    } else {
      data = fs.readFileSync(filePath);
    }

    files.push({ name, path: filePath, data, extension: ext });
  }

  return files;
}

// ============================================================================
// FILE UTILITIES
// ============================================================================

function findLatestFile(files: DataFileInfo[], prefix: string, extension: string, nameIncludes?: string): DataFileInfo | null {
  const filtered = files.filter((f: DataFileInfo) => {
    if (f.extension !== extension) return false;
    if (nameIncludes) return f.name.includes(nameIncludes);
    return f.name.startsWith(prefix);
  });
  filtered.sort((a: DataFileInfo, b: DataFileInfo) => b.name.localeCompare(a.name));
  return filtered.length > 0 ? filtered[0] : null;
}

function parseTimestampFromFilename(name: string, prefix: string, ext: string): Date | null {
  const stripped = name.replace(prefix, '').replace(ext, '');
  const match = stripped.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// ============================================================================
// DATASET HISTORY
// ============================================================================

function buildDatasetList(files: DataFileInfo[]): DatasetEntry[] {
  const scFiles = files.filter((f) => f.name.startsWith('SC-') && f.extension === '.json').sort((a, b) => b.name.localeCompare(a.name));
  const dcFiles = files.filter((f) => f.name.startsWith('DC-') && f.extension === '.xlsx').sort((a, b) => b.name.localeCompare(a.name));

  const pairedDc = new Set<string>();
  const entries: DatasetEntry[] = [];

  for (const sc of scFiles) {
    const scTs = parseTimestampFromFilename(sc.name, 'SC-', '.json');
    if (!scTs) continue;

    let bestDc: DataFileInfo | null = null;
    let bestDiff = Infinity;
    for (const dc of dcFiles) {
      if (pairedDc.has(dc.name)) continue;
      const dcTs = parseTimestampFromFilename(dc.name, 'DC-', '.xlsx');
      if (!dcTs) continue;
      const diff = Math.abs(scTs.getTime() - dcTs.getTime());
      if (diff < 5 * 60 * 1000 && diff < bestDiff) {
        bestDiff = diff;
        bestDc = dc;
      }
    }

    if (bestDc) pairedDc.add(bestDc.name);
    entries.push({
      label: formatTimestamp(scTs),
      scFile: sc,
      dcFile: bestDc,
      timestamp: scTs.toISOString()
    });
  }

  for (const dc of dcFiles) {
    if (pairedDc.has(dc.name)) continue;
    const dcTs = parseTimestampFromFilename(dc.name, 'DC-', '.xlsx');
    if (!dcTs) continue;
    entries.push({
      label: formatTimestamp(dcTs),
      scFile: null,
      dcFile: dc,
      timestamp: dcTs.toISOString()
    });
  }

  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  if (entries.length > 0) {
    entries[0].label += ' (Latest)';
  }

  return entries;
}

// ============================================================================
// DATA LOADING
// ============================================================================

type FileLoadResult = { loaded: boolean; issue?: string };

function loadJsonFile(file: DataFileInfo, store: DataStore): FileLoadResult {
  if (isSmartCookieAPIFormat(file.data)) {
    const validation = validateSCData(file.data);
    if (!validation.valid) {
      Logger.warn('SC data validation issues:', validation.issues);
    }
    importSmartCookieAPI(store, file.data);
    return { loaded: true };
  }
  return { loaded: false, issue: `Smart Cookie JSON not recognized: ${file.name}` };
}

async function loadExcelFile(
  file: DataFileInfo,
  validator: (data: Record<string, any>[]) => boolean,
  importer: (data: Record<string, any>[]) => void,
  errorLabel: string
): Promise<FileLoadResult> {
  const parsedData = await parseExcel(file.data);
  if (validator(parsedData)) {
    importer(parsedData);
    return { loaded: true };
  }
  return { loaded: false, issue: `${errorLabel}: ${file.name}` };
}

async function loadSourceFiles(
  files: DataFileInfo[],
  store: DataStore,
  specificSc?: DataFileInfo | null,
  specificDc?: DataFileInfo | null
): Promise<LoadedSources> {
  const issues: string[] = [];
  const scFile = specificSc !== undefined ? specificSc : findLatestFile(files, 'SC-', '.json');
  const dcFile = specificDc !== undefined ? specificDc : findLatestFile(files, 'DC-', '.xlsx');
  const scReportFile = findLatestFile(files, '', '.xlsx', 'ReportExport');
  const scTransferFile = findLatestFile(files, '', '.xlsx', 'CookieOrders');

  let scTimestamp: string | null = null;
  let dcTimestamp: string | null = null;

  // Smart Cookie API (JSON)
  let sc = false;
  if (scFile) {
    const r = loadJsonFile(scFile, store);
    sc = r.loaded;
    if (r.loaded) scTimestamp = parseTimestampFromFilename(scFile.name, 'SC-', '.json')?.toISOString() ?? null;
    else if (r.issue) issues.push(r.issue);
  }

  // Digital Cookie (Excel)
  let dc = false;
  if (dcFile) {
    const r = await loadExcelFile(
      dcFile,
      isDigitalCookieFormat,
      (data) => {
        const validation = validateDCData(data);
        if (!validation.valid) {
          Logger.warn('DC data validation issues:', validation.issues);
        }
        importDigitalCookie(store, data);
      },
      'Digital Cookie XLSX not recognized'
    );
    dc = r.loaded;
    if (r.loaded) dcTimestamp = parseTimestampFromFilename(dcFile.name, 'DC-', '.xlsx')?.toISOString() ?? null;
    else if (r.issue) issues.push(r.issue);
  }

  // Smart Cookie Report (Excel)
  let scReport = false;
  if (scReportFile) {
    const r = await loadExcelFile(
      scReportFile,
      (data) => data?.length > 0,
      (data) => importSmartCookieReport(store, data),
      'Smart Cookie Report empty/unreadable'
    );
    scReport = r.loaded;
    if (r.issue) issues.push(r.issue);
  }

  // Smart Cookie Transfers (Excel) — skipped if API data present
  let scTransfer = false;
  if (!sc && scTransferFile) {
    const r = await loadExcelFile(
      scTransferFile,
      (data) => data?.length > 0,
      (data) => importSmartCookie(store, data),
      'Smart Cookie Transfer empty/unreadable'
    );
    scTransfer = r.loaded;
    if (r.issue) issues.push(r.issue);
  } else if (sc && scTransferFile) {
    store.metadata.warnings.push({ type: 'SC_TRANSFER_SKIPPED', reason: 'SC API data present', file: scTransferFile.name });
    Logger.warn('Skipping CookieOrders.xlsx import because SC API data is present.');
  }

  return { sc, dc, scReport, scTransfer, issues, scTimestamp, dcTimestamp };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Load and build unified dataset from files on disk.
 * This is the main entry point for the data pipeline, called from the main process.
 */
export async function loadData(
  inDir: string,
  options?: { specificSc?: DataFileInfo | null; specificDc?: DataFileInfo | null }
): Promise<LoadDataResult | null> {
  const files = scanDataFiles(inDir);
  if (files.length === 0) return null;

  const store = createDataStore();
  const datasetList = buildDatasetList(files);
  const loaded = await loadSourceFiles(files, store, options?.specificSc, options?.specificDc);
  const anyLoaded = loaded.sc || loaded.dc || loaded.scReport || loaded.scTransfer;

  if (!anyLoaded) return null;

  Logger.debug('Building unified dataset...');
  const frozenStore: ReadonlyDataStore = store;
  const unified = buildUnifiedDataset(frozenStore);

  if (unified.metadata?.healthChecks?.warningsCount > 0) {
    Logger.warn('Health check warnings:', unified.warnings);
  }
  Logger.info('Unified dataset ready:', { scouts: Object.keys(unified.scouts).length });

  return { unified, datasetList, loaded };
}
