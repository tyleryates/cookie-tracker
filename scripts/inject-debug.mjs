#!/usr/bin/env node

// inject-debug.mjs — Creates a "Debug" profile by copying the default profile's
// data and injecting conditions that trigger every warning/alert state in the app.
//
// Usage: node scripts/inject-debug.mjs
//
// Creates/recreates a "Debug" profile with auto-sync disabled. Delete it from
// the app's Settings when done, or re-run this script to refresh it.

import * as fs from 'node:fs';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import { ensureProfile } from './profile-helpers.mjs';

const dataDir = ensureProfile('Debug', { copyFrom: 'default' });
const syncDir = path.join(dataDir, 'sync');

if (!fs.existsSync(syncDir)) {
  console.error('No sync/ data in default profile — run the app and sync first.');
  process.exit(1);
}

const TODAY = new Date().toISOString().slice(0, 10);
let mutations = 0;

function log(msg) {
  console.log(`  [debug] ${msg}`);
  mutations++;
}

// ============================================================================
// FILE HELPERS
// ============================================================================

function readJSON(filename) {
  const p = path.join(syncDir, filename);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJSON(filename, data) {
  fs.writeFileSync(path.join(syncDir, filename), JSON.stringify(data, null, 2), 'utf8');
}

// ============================================================================
// DC EXCEL MUTATIONS
// ============================================================================

/** Get a scout name from the DC Excel, or a fallback */
function getScoutName(rows) {
  for (const row of rows) {
    const last = row['Girl Last Name'] || '';
    if (last && last !== 'Site') {
      return { first: row['Girl First Name'] || 'Debug', last };
    }
  }
  return { first: 'Debug', last: 'Scout' };
}

function getSiteName(rows) {
  for (const row of rows) {
    if ((row['Girl Last Name'] || '') === 'Site') {
      return { first: row['Girl First Name'] || 'TroopDebug', last: 'Site' };
    }
  }
  return { first: 'TroopDebug', last: 'Site' };
}

function makeDCRow(name, orderNum, opts = {}) {
  return {
    'Order Number': orderNum,
    'Girl First Name': name.first,
    'Girl Last Name': name.last,
    'Order Date (Central Time)': TODAY,
    'Order Type': opts.orderType ?? 'In-Person Delivery',
    'Total Packages (Includes Donate & Gift)': opts.packages ?? '2',
    'Refunded Packages': '0',
    'Current Sale Amount': opts.amount ?? '12',
    'Order Status': opts.status ?? 'Completed',
    'Payment Status': opts.payment ?? 'CASH',
    Donation: opts.donation ?? '0',
  };
}

async function mutateDCExcel() {
  const excelPath = path.join(syncDir, 'dc-export.xlsx');
  if (!fs.existsSync(excelPath)) {
    console.log('  No dc-export.xlsx found, skipping DC mutations');
    return;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  const ws = workbook.worksheets[0];
  if (!ws) return;

  // Parse headers
  const headers = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col] = String(cell.value || '');
  });

  // Parse existing rows to find scout names and check existing statuses
  const rows = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const obj = {};
    row.eachCell((cell, col) => {
      if (headers[col]) obj[headers[col]] = String(cell.value || '');
    });
    rows.push({ rowNum, data: obj });
  });

  const scoutName = getScoutName(rows.map((r) => r.data));
  const siteName = getSiteName(rows.map((r) => r.data));

  // 1. Change first girl delivery order status to "Needs Approval" (triggers red pill)
  let setNA = false;
  let setPending = false;
  const statusCol = headers.indexOf('Order Status') !== -1
    ? headers.indexOf('Order Status')
    : Object.keys(headers).find((k) => headers[k] === 'Order Status');

  for (const { rowNum, data } of rows) {
    if (data['Girl Last Name'] === 'Site') continue;
    const status = data['Order Status'] || '';
    const type = data['Order Type'] || '';
    if (!status.includes('Completed') && !status.includes('Delivered')) continue;
    if (type.includes('Shipped') || type.includes('Donation')) continue;

    if (!setNA) {
      const colIdx = headers.findIndex((h) => h === 'Order Status');
      if (colIdx > 0) {
        ws.getRow(rowNum).getCell(colIdx).value = 'Needs Approval for Delivery';
        log(`Set order ${data['Order Number']} → "Needs Approval for Delivery"`);
        setNA = true;
        continue;
      }
    }
    if (!setPending) {
      const colIdx = headers.findIndex((h) => h === 'Order Status');
      if (colIdx > 0) {
        ws.getRow(rowNum).getCell(colIdx).value = 'Approved for Delivery';
        log(`Set order ${data['Order Number']} → "Approved for Delivery"`);
        setPending = true;
        break;
      }
    }
  }

  // 4. Change first order's payment to unknown "BITCOIN" (triggers health check)
  let setPayment = false;
  for (const { rowNum, data } of rows) {
    if (data['Payment Status']) {
      const colIdx = headers.findIndex((h) => h === 'Payment Status');
      if (colIdx > 0) {
        ws.getRow(rowNum).getCell(colIdx).value = 'BITCOIN';
        log(`Set payment → "BITCOIN" on order ${data['Order Number']}`);
        setPayment = true;
        break;
      }
    }
  }

  // Helper: add a new row to the Excel sheet
  function addRow(rowData) {
    const newRow = ws.addRow([]);
    for (const [header, value] of Object.entries(rowData)) {
      const colIdx = headers.findIndex((h) => h === header);
      if (colIdx > 0) newRow.getCell(colIdx).value = value;
    }
  }

  // Fallback rows if we couldn't mutate existing data
  if (!setNA) {
    addRow(makeDCRow(scoutName, 'DEBUG-NA-001', { status: 'Needs Approval for Delivery' }));
    log('Added "Needs Approval" debug DC row');
  }
  if (!setPending) {
    addRow(makeDCRow(scoutName, 'DEBUG-PD-001', { status: 'Approved for Delivery' }));
    log('Added "Pending" debug DC row');
  }
  if (!setPayment) {
    addRow(makeDCRow(scoutName, 'DEBUG-PAY-001', { packages: '1', amount: '6', payment: 'BITCOIN' }));
    log('Added "BITCOIN" payment debug DC row');
  }

  // 2. Add order that creates negative inventory (5 extra packages for a scout)
  addRow(makeDCRow(scoutName, 'DEBUG-NEG-001', { packages: '5', amount: '30' }));
  log('Added negative inventory debug DC row');

  // 5. Site delivery order (unallocated girl delivery)
  addRow(makeDCRow(siteName, 'DEBUG-GD-001', { packages: '3', amount: '18', payment: 'CAPTURED' }));
  log('Added unallocated girl delivery debug DC row');

  // 6. Site direct ship (unallocated)
  addRow(
    makeDCRow(siteName, 'DEBUG-DS-001', {
      orderType: 'Shipped by Girl Scouts',
      status: 'Shipped',
      payment: 'CAPTURED',
    })
  );
  log('Added unallocated direct ship debug DC row');

  // 7. Site booth sale (unallocated)
  addRow(makeDCRow(siteName, 'DEBUG-BS-001', { orderType: 'Cookies in Hand', packages: '4', amount: '24' }));
  log('Added unallocated booth sale debug DC row');

  // 9. Donation with no SC match
  addRow(makeDCRow(scoutName, 'DEBUG-DON-001', { packages: '3', amount: '18', donation: '2' }));
  log('Added donation reconciliation debug DC row');

  await workbook.xlsx.writeFile(excelPath);
}

// ============================================================================
// SC JSON MUTATIONS
// ============================================================================

function mutateSCOrders() {
  const data = readJSON('sc-orders.json');
  if (!data?.orders) {
    console.log('  No sc-orders.json found, skipping SC order mutations');
    return;
  }

  // 3. Inject unknown transfer type → health check warning
  data.orders.push({
    id: 'DEBUG-XYZZY',
    order_number: 'DEBUG-XYZZY',
    transfer_type: 'XYZZY',
    date: TODAY,
    from: 'Debug Troop',
    to: 'Debug Scout',
    cookies: [],
    total_cases: 0,
    total: '0',
    status: 'Completed',
    actions: { submittable: false, approvable: false },
  });
  log('Added unknown transfer type "XYZZY" to sc-orders.json');

  // 9b. Zero out first Cookie Share record transfer packages → donation reconciliation fails
  for (const order of data.orders) {
    const type = order.transfer_type || order.type || '';
    const orderNum = String(order.order_number || order.orderNumber || '');
    if (orderNum.startsWith('D')) continue; // Skip DC-origin orders
    if (type === 'CS' || type === 'COOKIE_SHARE') {
      if ((order.total_cases || 0) > 0) {
        order.total_cases = 0;
        order.cookies = [];
        log(`Zeroed Cookie Share packages on SC order ${orderNum}`);
        break;
      }
    }
  }

  writeJSON('sc-orders.json', data);
}

function mutateReservations() {
  const data = readJSON('sc-reservations.json');
  if (!data?.reservations?.length) {
    // No existing reservations — inject a synthetic past booth
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const synth = {
      reservations: [
        {
          id: 'DEBUG-BOOTH-001',
          troop_id: '0000',
          booth: {
            booth_id: 'debug-booth',
            store_name: 'Debug Store',
            address: { street: '123 Debug St', city: 'Testville', state: 'CA', zip: '90210' },
            reservation_type: 'FCFS',
            is_distributed: false,
            is_virtually_distributed: false,
          },
          timeslot: { date: yesterday, start_time: '10:00', end_time: '14:00' },
          cookies: [{ id: 4, quantity: 5 }],
        },
      ],
    };
    writeJSON('sc-reservations.json', data || synth);
    log('Injected synthetic past booth reservation (needs distribution)');
    return;
  }

  // 8. Set first non-virtual booth to undistributed
  for (const res of data.reservations) {
    const rtype = res.booth?.reservation_type || '';
    if (rtype.toLowerCase().includes('virtual')) continue;
    if (res.booth?.is_distributed) {
      res.booth.is_distributed = false;
      log(`Set is_distributed=false on booth "${res.booth.store_name}"`);
      break;
    }
  }

  writeJSON('sc-reservations.json', data);
}

function mutateBoothLocations() {
  let data = readJSON('sc-booth-locations.json');
  if (!Array.isArray(data)) data = [];

  // 10. Add fake available booth
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const dayAfter = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  data.push({
    id: 99999,
    store_name: 'Debug Grocery (Fake Booth)',
    address: { street: '456 Test Ave', city: 'Testville', state: 'CA', zip: '90210', latitude: 34.09, longitude: -118.41 },
    reservation_type: 'FCFS',
    notes: 'Injected by debug script',
    availableDates: [
      { date: tomorrow, timeSlots: [{ startTime: '10:00', endTime: '14:00' }, { startTime: '14:00', endTime: '18:00' }] },
      { date: dayAfter, timeSlots: [{ startTime: '10:00', endTime: '14:00' }] },
    ],
  });
  log('Added fake booth with 3 available slots to sc-booth-locations.json');

  writeJSON('sc-booth-locations.json', data);
}

function mutateCookieShares() {
  const data = readJSON('sc-cookie-shares.json');
  if (!data || typeof data !== 'object') return;

  // 9a. Zero out first virtual cookie share allocation
  for (const [key, entry] of Object.entries(data)) {
    if (entry.smart_divider_id) continue; // Skip booth dividers
    if (entry.girls?.length > 0) {
      for (const girl of entry.girls) {
        if ((girl.quantity || 0) > 0) {
          girl.quantity = 0;
          log(`Zeroed virtual cookie share for girl ${girl.id}`);
          writeJSON('sc-cookie-shares.json', data);
          return;
        }
      }
    }
  }
}

function mutateDirectShip() {
  const data = readJSON('sc-direct-ship.json');
  if (!data?.girls?.length) return;

  // 6b. Remove first direct ship allocation (creates unallocated direct ship warning)
  const removed = data.girls.shift();
  log(`Removed direct ship allocation for girl ${removed.id}`);
  writeJSON('sc-direct-ship.json', data);
}

function mutateBoothAllocations() {
  const data = readJSON('sc-booth-allocations.json');
  if (!data || typeof data !== 'object') return;

  // 7b. Remove first booth allocation (creates unallocated booth sale warning)
  const keys = Object.keys(data);
  for (const key of keys) {
    if (data[key]?.divider?.girls?.length > 0) {
      const removed = data[key].divider.girls.shift();
      log(`Removed booth allocation for girl ${removed.id} from reservation ${key}`);
      writeJSON('sc-booth-allocations.json', data);
      return;
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================

console.log(`Injecting debug mutations into: ${syncDir}`);

await mutateDCExcel();
mutateSCOrders();
mutateReservations();
mutateBoothLocations();
mutateCookieShares();
mutateDirectShip();
mutateBoothAllocations();

console.log(`Done — ${mutations} mutations applied to Debug profile.`);
