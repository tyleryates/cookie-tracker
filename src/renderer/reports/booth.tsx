import { BOOTH_RESERVATION_TYPE } from '../../constants';
import { COOKIE_TYPE, getCookieDisplayName } from '../../cookie-constants';
import type { BoothReservationImported, Scout, UnifiedDataset } from '../../types';
import { DataTable } from '../components/data-table';
import { ExpandableRow } from '../components/expandable-row';
import { StatCards } from '../components/stat-cards';
import { TooltipCell } from '../components/tooltip-cell';
import { buildVarietyTooltip, countBoothsNeedingDistribution, formatBoothDate, formatTimeRange, parseTimeToMinutes } from '../format-utils';

/** Parse YYYY-MM-DD as local midnight (avoids UTC parsing pitfall) */
function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split(/[-/]/);
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

/** Compute booth status based on date, time, and distribution state */
function getBoothStatus(r: BoothReservationImported, todayLocal: Date, nowMinutes: number): { text: string; className: string } {
  if (r.booth.isDistributed) return { text: 'Distributed', className: 'status-success' };

  const boothDate = r.timeslot.date ? parseLocalDate(r.timeslot.date) : null;
  if (!boothDate) return { text: 'Needs Distribution', className: 'status-warning' };

  const isToday = boothDate.getTime() === todayLocal.getTime();
  const isFuture = boothDate > todayLocal;

  if (isFuture) return { text: 'Upcoming', className: 'muted-text' };

  if (isToday) {
    const startMin = parseTimeToMinutes(r.timeslot.startTime || '');
    const endMin = parseTimeToMinutes(r.timeslot.endTime || '');

    if (startMin >= 0 && nowMinutes < startMin) return { text: 'Today', className: 'status-info' };
    if (endMin >= 0 && nowMinutes < endMin) return { text: 'In Progress', className: 'status-info' };
    // After end time today — needs distribution
  }

  // Past (or today after end time) and not distributed
  return { text: 'Needs Distribution', className: 'status-warning' };
}

function BoothScoutAllocations({ booth, scouts }: { booth: BoothReservationImported; scouts: Record<string, Scout> }) {
  if (!scouts) return null;

  const scoutCredits: Array<{ name: string; total: number }> = [];
  for (const [name, scout] of Object.entries(scouts)) {
    if (scout.isSiteOrder) continue;
    const boothAllocations = scout.$allocationsByChannel.booth;
    const matching = boothAllocations.filter((a) => {
      const storeMatch = (a.storeName || '').toLowerCase() === (booth.booth.storeName || '').toLowerCase();
      return storeMatch && a.date === booth.timeslot.date;
    });
    if (matching.length > 0) {
      const total = matching.reduce((sum, a) => sum + a.packages + a.donations, 0);
      scoutCredits.push({ name, total });
    }
  }

  if (scoutCredits.length === 0) {
    return (
      <div class="booth-detail-content muted-text">No scout allocations yet. Distribute in Smart Cookie to see per-scout breakdown.</div>
    );
  }

  scoutCredits.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div class="booth-detail-content">
      {scoutCredits.map(({ name, total }) => (
        <div key={name} class="booth-allocation-chip">
          <strong>{name}</strong>
          <span class="booth-allocation-credit">{total} sales</span>
        </div>
      ))}
    </div>
  );
}

export function BoothReport({ data }: { data: UnifiedDataset }) {
  if (!data) {
    return (
      <div class="report-visual">
        <p>No data available. Please import data first.</p>
      </div>
    );
  }

  const boothReservations = data.boothReservations || [];
  const scouts = data.scouts;

  const nonVirtualReservations = boothReservations.filter((r: BoothReservationImported) => {
    const type = (r.booth.reservationType || '').toLowerCase();
    return !type.includes('virtual');
  });

  const totalReservations = nonVirtualReservations.length;
  const distributed = nonVirtualReservations.filter((r: BoothReservationImported) => r.booth.isDistributed).length;
  const pastNotDistributed = countBoothsNeedingDistribution(boothReservations);
  const now = new Date();
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const totalBoothPackages = data.troopTotals.boothSalesPackages;
  const totalBoothDonations = data.troopTotals.boothSalesDonations;

  if (totalReservations === 0 && totalBoothPackages === 0 && totalBoothDonations === 0) {
    return (
      <div class="report-visual">
        <h3>Booth Reservations & Sales</h3>
        <p class="muted-text">
          No booth reservation or allocation data available. Booth data is fetched from the Smart Cookie reservations API during sync.
        </p>
      </div>
    );
  }

  const sorted = [...nonVirtualReservations].sort((a, b) => {
    const dateA = a.timeslot.date || '';
    const dateB = b.timeslot.date || '';
    return dateA.localeCompare(dateB);
  });

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>Booth Reservations & Sales</h3>
        <span class={`report-status-badge ${pastNotDistributed > 0 ? 'report-status-warning' : 'report-status-ok'}`}>
          {pastNotDistributed > 0 ? 'Needs Distribution' : 'All OK'}
        </span>
      </div>

      {pastNotDistributed > 0 && (
        <div class="info-box info-box-warning">
          <p>
            <strong>
              {pastNotDistributed} booth{pastNotDistributed === 1 ? '' : 's'} needs distribution
            </strong>{' '}
            — allocate cookies in Smart Cookie.
          </p>
        </div>
      )}

      <StatCards
        stats={[
          { label: 'Reservations', value: totalReservations, description: 'Total booth slots', color: '#1565C0' },
          { label: 'Distributed', value: distributed, description: 'Allocations complete', color: '#2E7D32' },
          { label: 'Booth Sales', value: totalBoothPackages, description: 'Physical cookies', color: '#7B1FA2' },
          {
            label: 'Booth Donations',
            value: totalBoothDonations,
            description: getCookieDisplayName(COOKIE_TYPE.COOKIE_SHARE),
            color: totalBoothDonations > 0 ? '#E91E63' : '#999'
          }
        ]}
      />

      {nonVirtualReservations.length > 0 && (
        <DataTable
          columns={['', 'Store', 'Date', 'Time', 'Type', 'Packages', 'Donations', 'Status']}
          className="table-normal booth-table"
          hint="Click on any booth to see scouts who attended that booth."
        >
          {sorted.map((r, idx) => {
            const timeDisplay = formatTimeRange(r.timeslot.startTime, r.timeslot.endTime);
            const { text: statusText, className: statusClass } = getBoothStatus(r, todayLocal, nowMinutes);

            const donations = r.cookies?.[COOKIE_TYPE.COOKIE_SHARE] || 0;
            const physicalPackages = r.physicalPackages;
            const physicalCookies = { ...r.cookies };
            delete physicalCookies[COOKIE_TYPE.COOKIE_SHARE];
            const tip = buildVarietyTooltip(physicalCookies);

            return (
              <ExpandableRow
                key={idx}
                rowClass="booth-row"
                separateCaret
                firstCell={
                  <>
                    <strong>{r.booth.storeName || '-'}</strong>
                    {r.booth.address && <div class="booth-address">{r.booth.address}</div>}
                  </>
                }
                cells={[
                  r.timeslot.date ? formatBoothDate(r.timeslot.date) : '-',
                  timeDisplay,
                  <span
                    class={`booth-type-badge ${r.booth.reservationType === BOOTH_RESERVATION_TYPE.LOTTERY ? 'type-lottery' : r.booth.reservationType === BOOTH_RESERVATION_TYPE.FCFS ? 'type-fcfs' : 'type-default'}`}
                  >
                    {r.booth.reservationType || '-'}
                  </span>,
                  tip ? (
                    <TooltipCell tooltip={tip} tag="span" className="tooltip-cell">
                      {physicalPackages}
                    </TooltipCell>
                  ) : (
                    physicalPackages
                  ),
                  donations > 0 ? donations : '—',
                  <span class={statusClass}>{statusText}</span>
                ]}
                detail={<BoothScoutAllocations booth={r} scouts={scouts} />}
                colSpan={8}
                detailClass="detail-row"
              />
            );
          })}
        </DataTable>
      )}
    </div>
  );
}
