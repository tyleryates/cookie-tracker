import type { UnifiedDataset } from '../../types';
import { DataTable } from '../components/data-table';
import { countBoothsNeedingDistribution, getActiveScouts } from '../format-utils';

interface TodoItem {
  name: string;
  detail: string;
  link: string;
}

function computeActions(data: UnifiedDataset, availableSlotCount: number): { pending: TodoItem[]; done: TodoItem[] } {
  const pending: TodoItem[] = [];
  const done: TodoItem[] = [];

  // DC data sync
  if (!data.metadata.lastImportDC) {
    pending.push({
      name: 'Sync Digital Cookie data',
      detail: 'DC data not loaded — some reports may be incomplete',
      link: 'settings'
    });
  }

  // Girl Delivery Allocation
  const gd = data.siteOrders.girlDelivery;
  if (gd.total > 0) {
    const item = {
      name: 'Distribute girl delivery orders',
      detail: gd.hasWarning
        ? `${gd.unallocated} of ${gd.total} package${gd.total === 1 ? '' : 's'} undistributed`
        : `${gd.total} packages distributed`,
      link: 'troop-sales'
    };
    (gd.hasWarning ? pending : done).push(item);
  }

  // Direct Ship Allocation
  const ds = data.siteOrders.directShip;
  if (ds.total > 0) {
    const item = {
      name: 'Distribute direct ship orders',
      detail: ds.hasWarning
        ? `${ds.unallocated} of ${ds.total} package${ds.total === 1 ? '' : 's'} undistributed`
        : `${ds.total} packages distributed`,
      link: 'troop-sales'
    };
    (ds.hasWarning ? pending : done).push(item);
  }

  // Booths: distribution + booth sale allocation
  const needsDist = countBoothsNeedingDistribution(data.boothReservations);
  const bs = data.siteOrders.boothSale;
  const hasBoothIssues = needsDist > 0 || bs.hasWarning;
  if (hasBoothIssues || data.boothReservations.length > 0) {
    const details: string[] = [];
    if (needsDist > 0) details.push(`${needsDist} booth${needsDist === 1 ? ' needs' : 's need'} distribution`);
    if (bs.hasWarning) details.push(`${bs.unallocated} of ${bs.total} booth sale package${bs.total === 1 ? '' : 's'} undistributed`);

    const item = {
      name: 'Distribute booth cookies',
      detail: hasBoothIssues ? details.join('; ') : 'All distributed',
      link: 'completed-booths'
    };
    (hasBoothIssues ? pending : done).push(item);
  }

  // Booth Finder
  if (availableSlotCount > 0) {
    pending.push({
      name: 'Review booth finder results',
      detail: `Book or ignore ${availableSlotCount} available time slot${availableSlotCount === 1 ? '' : 's'}`,
      link: 'available-booths'
    });
  }

  // Donations Reconciled
  const item = {
    name: 'Reconcile donations in Smart Cookie',
    detail: data.cookieShare.reconciled ? 'Reconciled' : 'Needs attention',
    link: 'donation-alert'
  };
  (data.cookieShare.reconciled ? done : pending).push(item);

  return { pending, done };
}

function computeWarnings(data: UnifiedDataset): TodoItem[] {
  const warnings: TodoItem[] = [];

  // Scout Negative Inventory
  const negInv = data.troopTotals.scouts.withNegativeInventory;
  if (negInv > 0) {
    warnings.push({
      name: 'Scouts with negative inventory',
      detail: `${negInv} scout${negInv === 1 ? '' : 's'} with negative inventory`,
      link: 'scout-inventory'
    });
  }

  // Scouts with unapproved orders
  const scoutsWithUnapproved = getActiveScouts(data.scouts).filter(([, scout]) => scout.totals.$orderStatusCounts.needsApproval > 0);
  if (scoutsWithUnapproved.length > 0) {
    const totalUnapproved = scoutsWithUnapproved.reduce((sum, [, s]) => sum + s.totals.$orderStatusCounts.needsApproval, 0);
    warnings.push({
      name: 'Scouts with unapproved orders',
      detail: `${totalUnapproved} order${totalUnapproved === 1 ? '' : 's'} across ${scoutsWithUnapproved.length} scout${scoutsWithUnapproved.length === 1 ? '' : 's'}`,
      link: 'summary'
    });
  }

  return warnings;
}

interface HealthCheckReportProps {
  data: UnifiedDataset;
  availableSlotCount: number;
  onNavigate: (type: string) => void;
}

function TodoRow({
  item,
  icon,
  iconClass,
  linkClass,
  onNavigate
}: {
  item: TodoItem;
  icon: string;
  iconClass: string;
  linkClass: string;
  onNavigate: (type: string) => void;
}) {
  return (
    <tr key={item.name}>
      <td class="text-center" style={{ fontSize: '1.1em' }}>
        <span class={iconClass}>{icon}</span>
      </td>
      <td>
        <button type="button" class={linkClass} onClick={() => onNavigate(item.link)}>
          {item.name}
        </button>
      </td>
      <td>{item.detail}</td>
    </tr>
  );
}

export function HealthCheckReport({ data, availableSlotCount, onNavigate }: HealthCheckReportProps) {
  const { pending, done } = computeActions(data, availableSlotCount);
  const warnings = computeWarnings(data);

  const totalPending = pending.length + warnings.length;
  const badgeText =
    totalPending === 0
      ? 'All Done'
      : pending.length > 0 && warnings.length > 0
        ? `${pending.length} Action${pending.length === 1 ? '' : 's'}, ${warnings.length} Warning${warnings.length === 1 ? '' : 's'}`
        : pending.length > 0
          ? `${pending.length} To-Do`
          : `${warnings.length} Warning${warnings.length === 1 ? '' : 's'}`;

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>To-Do</h3>
        <span
          class={`report-status-badge ${totalPending === 0 ? 'report-status-ok' : pending.length > 0 ? 'report-status-warning' : 'report-status-info'}`}
        >
          {badgeText}
        </span>
      </div>

      {pending.length > 0 && (
        <>
          <h4 style={{ marginTop: '20px', marginBottom: '12px' }}>Action Required</h4>
          <DataTable columns={['', 'Action', 'Detail']} columnAligns={['center', undefined, undefined]}>
            {pending.map((item) => (
              <TodoRow
                key={item.name}
                item={item}
                icon={'\u26A0'}
                iconClass="status-warning"
                linkClass="health-check-link"
                onNavigate={onNavigate}
              />
            ))}
          </DataTable>
        </>
      )}

      {warnings.length > 0 && (
        <>
          <h4 style={{ marginTop: '28px', marginBottom: '12px' }}>Warnings</h4>
          <DataTable columns={['', 'Item', 'Detail']} columnAligns={['center', undefined, undefined]}>
            {warnings.map((item) => (
              <TodoRow
                key={item.name}
                item={item}
                icon={'\u24D8'}
                iconClass="status-info"
                linkClass="health-check-link health-check-link-info"
                onNavigate={onNavigate}
              />
            ))}
          </DataTable>
        </>
      )}

      {done.length > 0 && (
        <>
          <h4 style={{ marginTop: '28px', marginBottom: '12px' }}>Completed</h4>
          <DataTable columns={['', 'Action', 'Detail']} columnAligns={['center', undefined, undefined]}>
            {done.map((item) => (
              <TodoRow
                key={item.name}
                item={item}
                icon={'\u2713'}
                iconClass="status-success"
                linkClass="health-check-link health-check-link-done"
                onNavigate={onNavigate}
              />
            ))}
          </DataTable>
        </>
      )}
    </div>
  );
}
