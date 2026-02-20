import type { ComponentChildren } from 'preact';
import type { Scout, UnifiedDataset } from '../../types';
import { DataTable } from '../components/data-table';
import { ExpandableRow } from '../components/expandable-row';
import { STAT_COLORS, StatCards } from '../components/stat-cards';
import { formatCurrency, formatShortDate, getActiveScouts } from '../format-utils';

// ============================================================================
// Detail breakdown for each scout's expandable row
// ============================================================================

function FinanceDetail({ scout }: { scout: Scout }) {
  const f = scout.totals.$financials;
  const payments = [...scout.payments].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div class="scout-breakdown">
      <div class="section-break-sm">
        <DataTable columns={['', '']} className="table-compact">
          <tr>
            <td>Pickup value</td>
            <td>{formatCurrency(f.inventoryValue)}</td>
          </tr>
          {f.electronicPayments > 0 && (
            <tr>
              <td>Electronic payments</td>
              <td>-{formatCurrency(f.electronicPayments)}</td>
            </tr>
          )}
          {f.cashCollected > 0 && (
            <tr>
              <td>Sales cash</td>
              <td>{formatCurrency(f.cashCollected)}</td>
            </tr>
          )}
          {f.unsoldValue > 0 && (
            <tr>
              <td>Unsold inventory</td>
              <td>{formatCurrency(f.unsoldValue)}</td>
            </tr>
          )}
          <tr>
            <td>
              <strong>Cash owed</strong>
            </td>
            <td>
              <strong>{formatCurrency(f.cashOwed)}</strong>
            </td>
          </tr>
          {f.paymentsTurnedIn > 0 && (
            <tr>
              <td>Payments turned in</td>
              <td>-{formatCurrency(f.paymentsTurnedIn)}</td>
            </tr>
          )}
          <tr>
            <td>
              <strong>Cash due</strong>
            </td>
            <td>
              <strong>{formatCurrency(f.cashDue)}</strong>
            </td>
          </tr>
        </DataTable>
      </div>

      {payments.length > 0 && (
        <div class="section-break">
          <h5>Payments Turned In</h5>
          <div class="section-break-sm">
            <DataTable columns={['Date', 'Amount', 'Method', 'Reference']} className="table-compact">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatShortDate(p.date)}</td>
                  <td>{formatCurrency(p.amount)}</td>
                  <td>{p.method}</td>
                  <td>{p.reference || '\u2014'}</td>
                </tr>
              ))}
            </DataTable>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main report component
// ============================================================================

export function FinanceReport({ data, banner }: { data: UnifiedDataset; banner?: ComponentChildren }) {
  if (!data?.scouts) {
    return (
      <div class="report-visual">
        <p>No data available. Please import data first.</p>
      </div>
    );
  }

  const sortedScouts = getActiveScouts(data.scouts).filter(([, scout]) => {
    const f = scout.totals.$financials;
    return f.cashOwed > 0 || f.paymentsTurnedIn > 0;
  });

  // Troop-wide totals
  let totalCashOwed = 0;
  let totalPayments = 0;
  let totalCashDue = 0;
  for (const [, scout] of sortedScouts) {
    const f = scout.totals.$financials;
    totalCashOwed += f.cashOwed;
    totalPayments += f.paymentsTurnedIn;
    totalCashDue += f.cashDue;
  }

  const stats = [
    {
      label: 'Cash Owed',
      value: formatCurrency(totalCashOwed),
      description: 'Pickup value minus electronic payments',
      color: STAT_COLORS.BLUE
    },
    {
      label: 'Cash Turned In',
      value: formatCurrency(totalPayments),
      description: 'Money received from scouts',
      color: STAT_COLORS.TEAL,
      operator: '\u2212'
    },
    {
      label: 'Cash Due',
      value: formatCurrency(totalCashDue),
      description: 'Still owed to the troop',
      color: totalCashDue > 0 ? STAT_COLORS.RED : STAT_COLORS.GREEN,
      operator: '=',
      highlight: true
    }
  ];

  const COLUMN_COUNT = 4;

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>Scout Cash Report</h3>
      </div>
      {banner}
      {!data.metadata.lastImportDC && (
        <div class="info-box info-box-warning">
          <p class="meta-text">
            <strong>No Digital Cookie Data</strong>
          </p>
          <p class="meta-text">
            Cash owed amounts may be incomplete.
            <br />
            Click the refresh button in the header to download Digital Cookie data.
          </p>
        </div>
      )}

      <StatCards stats={stats} />
      <DataTable columns={['Scout', 'Cash Owed', 'Paid', 'Cash Due']} className="table-normal scout-table">
        {sortedScouts.map(([name, scout]) => {
          const f = scout.totals.$financials;
          const cashDue = Math.round(f.cashDue);
          const cashDueClass = cashDue > 0 ? 'status-error-dark' : 'success-text';

          return (
            <ExpandableRow
              key={name}
              rowClass="scout-row"
              firstCell={<strong>{name}</strong>}
              cells={[
                formatCurrency(f.cashOwed),
                f.paymentsTurnedIn > 0 ? formatCurrency(f.paymentsTurnedIn) : '\u2014',
                cashDue > 0 ? <span class={cashDueClass}>{formatCurrency(f.cashDue)}</span> : '\u2014'
              ]}
              detail={<FinanceDetail scout={scout} />}
              colSpan={COLUMN_COUNT}
              detailClass="scout-detail"
            />
          );
        })}
      </DataTable>
    </div>
  );
}
