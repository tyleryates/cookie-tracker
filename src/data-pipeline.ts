// Data Pipeline — runs in main process.
// Scan → parse → import → build unified → return to renderer.

import * as fs from 'node:fs';
import * as path from 'node:path';
import XLSX from 'xlsx';
import { DC_COLUMNS } from './constants';
import { buildUnifiedDataset } from './data-processing/calculators/index';
import { importDigitalCookie, importSmartCookie, importSmartCookieAPI, importSmartCookieReport } from './data-processing/data-importers';
import { createDataStore, type DataStore } from './data-store';
import Logger from './logger';
import type { DataFileInfo, UnifiedDataset } from './types';

// ============================================================================
// TYPES
// ============================================================================

interface DatasetEntry {
  label: string;
  scFile: DataFileInfo | null;
  dcFile: DataFileInfo | null;
  timestamp: string;
}

interface LoadedSources {
  sc: boolean;
  dc: boolean;
  scReport: boolean;
  scTransfer: boolean;
  issues: string[];
  scTimestamp: string | null;
  dcTimestamp: string | null;
}

interface LoadDataResult {
  unified: UnifiedDataset;
  datasetList: DatasetEntry[];
  loaded: LoadedSources;
}

// ============================================================================
// EXCEL PARSING
// ============================================================================

function parseExcel(buffer: Buffer): Record<string, any>[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  fixWorksheetRange(firstSheet);
  return XLSX.utils.sheet_to_json(firstSheet, { raw: false });
}

function fixWorksheetRange(worksheet: XLSX.WorkSheet): void {
  if (!worksheet) return;
  const keys = Object.keys(worksheet).filter((k) => !k.startsWith('!'));
  if (keys.length === 0) return;

  let maxRow = 0;
  let maxCol = 0;

  keys.forEach((key) => {
    const match = key.match(/^([A-Z]+)(\d+)$/);
    if (!match) return;
    const [, colLetters, rowStr] = match;
    const row = parseInt(rowStr, 10);
    const col = XLSX.utils.decode_col(colLetters);
    if (row > maxRow) maxRow = row;
    if (col > maxCol) maxCol = col;
  });

  if (maxRow > 0) {
    const range = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow - 1, c: maxCol } });
    worksheet['!ref'] = range;
  }
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

function extractTimestamp(filename: string, prefix: string, extension: string): string | null {
  const timestampStr = filename.replace(prefix, '').replace(extension, '');
  const isoTimestamp = timestampStr.replace(/-(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3');
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return null;
  return isoTimestamp;
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

function loadJsonFile(file: DataFileInfo, rec: DataStore): FileLoadResult {
  if (isSmartCookieAPIFormat(file.data)) {
    importSmartCookieAPI(rec, file.data);
    return { loaded: true };
  }
  return { loaded: false, issue: `Smart Cookie JSON not recognized: ${file.name}` };
}

function loadExcelFile(
  file: DataFileInfo,
  validator: (data: Record<string, any>[]) => boolean,
  importer: (data: Record<string, any>[]) => void,
  errorLabel: string
): FileLoadResult {
  const parsedData = parseExcel(file.data);
  if (validator(parsedData)) {
    importer(parsedData);
    return { loaded: true };
  }
  return { loaded: false, issue: `${errorLabel}: ${file.name}` };
}

function loadSourceFiles(
  files: DataFileInfo[],
  rec: DataStore,
  specificSc?: DataFileInfo | null,
  specificDc?: DataFileInfo | null
): LoadedSources {
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
    const r = loadJsonFile(scFile, rec);
    sc = r.loaded;
    if (r.loaded) scTimestamp = extractTimestamp(scFile.name, 'SC-', '.json');
    else if (r.issue) issues.push(r.issue);
  }

  // Digital Cookie (Excel)
  let dc = false;
  if (dcFile) {
    const r = loadExcelFile(dcFile, isDigitalCookieFormat, (data) => importDigitalCookie(rec, data), 'Digital Cookie XLSX not recognized');
    dc = r.loaded;
    if (r.loaded) dcTimestamp = extractTimestamp(dcFile.name, 'DC-', '.xlsx');
    else if (r.issue) issues.push(r.issue);
  }

  // Smart Cookie Report (Excel)
  let scReport = false;
  if (scReportFile) {
    const r = loadExcelFile(
      scReportFile,
      (data) => data?.length > 0,
      (data) => importSmartCookieReport(rec, data),
      'Smart Cookie Report empty/unreadable'
    );
    scReport = r.loaded;
    if (r.issue) issues.push(r.issue);
  }

  // Smart Cookie Transfers (Excel) — skipped if API data present
  let scTransfer = false;
  if (!sc && scTransferFile) {
    const r = loadExcelFile(
      scTransferFile,
      (data) => data?.length > 0,
      (data) => importSmartCookie(rec, data),
      'Smart Cookie Transfer empty/unreadable'
    );
    scTransfer = r.loaded;
    if (r.issue) issues.push(r.issue);
  } else if (sc && scTransferFile) {
    rec.metadata.warnings.push({ type: 'SC_TRANSFER_SKIPPED', reason: 'SC API data present', file: scTransferFile.name });
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
export function loadData(
  inDir: string,
  options?: { specificSc?: DataFileInfo | null; specificDc?: DataFileInfo | null }
): LoadDataResult | null {
  const files = scanDataFiles(inDir);
  if (files.length === 0) return null;

  const store = createDataStore();
  const datasetList = buildDatasetList(files);
  const loaded = loadSourceFiles(files, store, options?.specificSc, options?.specificDc);
  const anyLoaded = loaded.sc || loaded.dc || loaded.scReport || loaded.scTransfer;

  if (!anyLoaded) return null;

  Logger.debug('Building unified dataset...');
  const unified = buildUnifiedDataset(store);

  if (unified.metadata?.healthChecks?.warningsCount > 0) {
    Logger.warn('Health check warnings:', unified.warnings);
  }
  Logger.info('Unified dataset ready:', { scouts: unified.scouts.size });

  return { unified, datasetList, loaded };
}
