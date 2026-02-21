import type { Scout, UnifiedDataset } from '../../types';
import { DataTable } from '../components/data-table';
import { ExpandableRow } from '../components/expandable-row';
import { NoDCDataWarning } from '../components/no-dc-data-warning';
import { STAT_COLORS, type Stat, StatCards } from '../components/stat-cards';
import { formatCurrency, formatShortDate, getActiveScouts } from '../format-utils';

// ============================================================================
// Detail breakdown for each scout's expandable row
// ============================================================================

function FinanceDetail({ scout }: { scout: Scout }) {
  const f = scout.totals.$financials;
  const payments = [...scout.payments].sort((a, b) => b.date.localeCompare(a.date));

  const detailStats: Stat[] = [
    { label: 'Pickup Value', value: formatCurrency(f.inventoryValue), description: 'Cookies picked up', color: STAT_COLORS.BLUE }
  ];

  if (f.electronicPayments > 0) {
    detailStats.push({
      label: 'Electronic',
      value: formatCurrency(f.electronicPayments),
      description: 'Digital payments',
      color: STAT_COLORS.TEAL,
      operator: '\u2212'
    });
  }

  if (f.paymentsTurnedIn > 0) {
    detailStats.push({
      label: 'Cash Owed',
      value: formatCurrency(f.cashOwed),
      description: f.electronicPayments > 0 ? 'After digital payments' : 'Total owed',
      color: STAT_COLORS.BLUE,
      operator: f.electronicPayments > 0 ? '=' : undefined
    });
    detailStats.push({
      label: 'Paid',
      value: formatCurrency(f.paymentsTurnedIn),
      description: 'Turned in to troop',
      color: STAT_COLORS.GREEN,
      operator: '\u2212'
    });
  }

  detailStats.push({
    label: 'Cash Due',
    value: formatCurrency(f.cashDue),
    description: f.cashDue > 0 ? 'Still owed' : 'Fully paid',
    color: f.cashDue > 0 ? STAT_COLORS.RED : STAT_COLORS.GREEN,
    operator: '=',
    highlight: true
  });

  return (
    <div class="scout-breakdown">
      <StatCards stats={detailStats} compact />

      {payments.length > 0 && (
        <div class="section-break">
          <h5>Payments Turned In</h5>
          <div class="section-break-sm">
            <DataTable columns={['Date', 'Amount', 'Method', 'Reference']} className="table-compact">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatShortDate(p.date)}</td>
                  <td>
                    <span class="cash-amount">{formatCurrency(p.amount)}</span>
                  </td>
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

export function FinanceReport({ data }: { data: UnifiedDataset }) {
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
      {!data.metadata.lastImportDC && <NoDCDataWarning>Cash owed amounts may be incomplete.</NoDCDataWarning>}

      <StatCards stats={stats} />
      <DataTable
        columns={['Scout', 'Cash Owed', 'Paid', 'Cash Due']}
        className="table-normal scout-table"
        hint="Click a row to see payment breakdown."
      >
        {sortedScouts.map(([name, scout]) => {
          const f = scout.totals.$financials;
          const cashDue = Math.round(f.cashDue);

          return (
            <ExpandableRow
              key={name}
              rowClass="scout-row"
              firstCell={<strong>{name}</strong>}
              cells={[
                <span class="digital-amount">{formatCurrency(f.cashOwed)}</span>,
                f.paymentsTurnedIn > 0 ? <span class="cash-amount">{formatCurrency(f.paymentsTurnedIn)}</span> : '\u2014',
                cashDue > 0 ? (
                  <span class="cash-due-pill">{formatCurrency(f.cashDue)}</span>
                ) : f.paymentsTurnedIn > 0 ? (
                  <span class="cash-paid-pill">{'\u2713 Paid'}</span>
                ) : (
                  '\u2014'
                )
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
