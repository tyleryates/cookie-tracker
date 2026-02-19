import type { ComponentChildren } from 'preact';
import type { UnifiedDataset } from '../../types';
import { DataTable } from '../components/data-table';
import { countBoothsNeedingDistribution } from '../format-utils';

interface TodoItem {
  name: string;
  done: boolean;
  detail: string;
  link: string;
}

function computeTodos(data: UnifiedDataset): TodoItem[] {
  const items: TodoItem[] = [];

  // Girl Delivery Allocation
  const gd = data.siteOrders.girlDelivery;
  if (gd.total > 0) {
    items.push({
      name: 'Distribute girl delivery orders',
      done: !gd.hasWarning,
      detail: gd.hasWarning
        ? `${gd.unallocated} of ${gd.total} package${gd.unallocated === 1 ? '' : 's'} undistributed`
        : `${gd.total} packages distributed`,
      link: 'troop-sales'
    });
  }

  // Direct Ship Allocation
  const ds = data.siteOrders.directShip;
  if (ds.total > 0) {
    items.push({
      name: 'Distribute direct ship orders',
      done: !ds.hasWarning,
      detail: ds.hasWarning
        ? `${ds.unallocated} of ${ds.total} package${ds.unallocated === 1 ? '' : 's'} undistributed`
        : `${ds.total} packages distributed`,
      link: 'troop-sales'
    });
  }

  // Booths: distribution + booth sale allocation (both shown on completed-booths page)
  const needsDist = countBoothsNeedingDistribution(data.boothReservations);
  const bs = data.siteOrders.boothSale;
  const hasBoothIssues = needsDist > 0 || bs.hasWarning;
  if (hasBoothIssues || data.boothReservations.length > 0) {
    const details: string[] = [];
    if (needsDist > 0) details.push(`${needsDist} booth${needsDist === 1 ? '' : 's'} need distribution`);
    if (bs.hasWarning) details.push(`${bs.unallocated} of ${bs.total} booth sale package${bs.unallocated === 1 ? '' : 's'} undistributed`);

    items.push({
      name: 'Distribute booth cookies',
      done: !hasBoothIssues,
      detail: hasBoothIssues ? details.join('; ') : 'All distributed',
      link: 'completed-booths'
    });
  }

  // Scout Negative Inventory
  const negInv = data.troopTotals.scouts.withNegativeInventory;
  items.push({
    name: 'Resolve scout inventory',
    done: negInv === 0,
    detail: negInv > 0 ? `${negInv} scout${negInv === 1 ? '' : 's'} with negative inventory` : 'No negative inventory',
    link: 'scout-inventory'
  });

  // Donations Reconciled
  items.push({
    name: 'Reconcile donations in Smart Cookie',
    done: data.cookieShare.reconciled,
    detail: data.cookieShare.reconciled ? 'Reconciled' : 'Needs attention',
    link: 'donation-alert'
  });

  return items;
}

interface HealthCheckReportProps {
  data: UnifiedDataset;
  banner?: ComponentChildren;
  onNavigate: (type: string) => void;
}

export function HealthCheckReport({ data, banner, onNavigate }: HealthCheckReportProps) {
  const items = computeTodos(data);
  const pending = items.filter((t) => !t.done);
  const done = items.filter((t) => t.done);

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>To-Do</h3>
        <span class={`report-status-badge ${pending.length === 0 ? 'report-status-ok' : 'report-status-warning'}`}>
          {pending.length === 0 ? 'All Done' : `${pending.length} To-Do`}
        </span>
      </div>
      {banner}

      {pending.length > 0 && (
        <DataTable columns={['', 'Action', 'Detail']} columnAligns={['center', undefined, undefined]}>
          {pending.map((item) => (
            <tr key={item.name}>
              <td class="text-center" style={{ fontSize: '1.1em' }}>
                <span class="status-warning">{'\u26A0'}</span>
              </td>
              <td>
                <button type="button" class="health-check-link" onClick={() => onNavigate(item.link)}>
                  <strong>{item.name}</strong>
                </button>
              </td>
              <td>{item.detail}</td>
            </tr>
          ))}
        </DataTable>
      )}

      {done.length > 0 && (
        <>
          {pending.length > 0 && <h4 style={{ marginTop: '28px', marginBottom: '12px' }}>Completed</h4>}
          <DataTable columns={['', 'Action', 'Detail']} columnAligns={['center', undefined, undefined]}>
            {done.map((item) => (
              <tr key={item.name}>
                <td class="text-center" style={{ fontSize: '1.1em' }}>
                  <span class="status-success">{'\u2713'}</span>
                </td>
                <td>
                  <button type="button" class="health-check-link health-check-link-done" onClick={() => onNavigate(item.link)}>
                    {item.name}
                  </button>
                </td>
                <td>{item.detail}</td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
    </div>
  );
}
