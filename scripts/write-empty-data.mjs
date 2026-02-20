#!/usr/bin/env node

// write-empty-data.mjs — Creates an "Empty" profile with minimal pipeline files
// so the app shows empty report states (vs "never synced" state).
//
// Usage: node scripts/write-empty-data.mjs
//
// Creates the "Empty" profile if it doesn't exist, or reuses it if it does.
// Delete it from the app's Settings when done.

import * as fs from 'node:fs';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import { ensureProfile } from './profile-helpers.mjs';

const dataDir = ensureProfile('Empty');
const syncDir = path.join(dataDir, 'sync');
fs.mkdirSync(syncDir, { recursive: true });

function writeJSON(filename, data) {
  fs.writeFileSync(path.join(syncDir, filename), JSON.stringify(data, null, 2), 'utf8');
}

// SC Orders — empty orders array
writeJSON('sc-orders.json', { orders: [], summary: { total_cases: 0 } });

// SC Reservations — no booth reservations
writeJSON('sc-reservations.json', { reservations: [] });

// SC Allocations — empty
writeJSON('sc-booth-allocations.json', {});
writeJSON('sc-direct-ship.json', { girls: [] });
writeJSON('sc-cookie-shares.json', {});

// SC Booth locations — empty
writeJSON('sc-booth-locations.json', []);

// SC Finance — empty
writeJSON('sc-finance.json', []);

// SC Troop identity — minimal
writeJSON('sc-troop.json', { role: { troop_id: '0000', troop_name: 'Troop 0000' } });

// SC Cookie ID map — standard mapping so imports don't warn
writeJSON('sc-cookie-id-map.json', {
  '1': 'CARAMEL_DELITES',
  '2': 'PEANUT_BUTTER_PATTIES',
  '3': 'TREFOILS',
  '4': 'THIN_MINTS',
  '5': 'PEANUT_BUTTER_SANDWICH',
  '34': 'LEMONADES',
  '37': 'COOKIE_SHARE',
  '48': 'ADVENTUREFULS',
  '52': 'CARAMEL_CHOCOLATE_CHIP',
  '56': 'EXPLOREMORES',
});

// DC Export — Excel with headers but no data rows
const DC_HEADERS = [
  'Order Number',
  'Girl First Name',
  'Girl Last Name',
  'Order Date (Central Time)',
  'Order Type',
  'Total Packages (Includes Donate & Gift)',
  'Refunded Packages',
  'Current Sale Amount',
  'Order Status',
  'Payment Status',
  'Donation',
  'Thin Mints',
  'Caramel deLites',
  'Peanut Butter Patties',
  'Peanut Butter Sandwich',
  'Trefoils',
  'Adventurefuls',
  'Lemonades',
  'Exploremores',
  'Caramel Chocolate Chip',
];

const workbook = new ExcelJS.Workbook();
const ws = workbook.addWorksheet('Sheet1');
ws.addRow(DC_HEADERS);
await workbook.xlsx.writeFile(path.join(syncDir, 'dc-export.xlsx'));

console.log(`Created Empty profile with empty pipeline files.`);
