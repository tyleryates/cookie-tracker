import { BOOTH_RESERVATION_TYPE } from '../../constants';
import { COOKIE_TYPE, getCookieDisplayName } from '../../cookie-constants';
import type { BoothReservationImported, Scout, UnifiedDataset } from '../../types';
import { DataTable } from '../components/data-table';
import { ExpandableRow } from '../components/expandable-row';
import { StatCards } from '../components/stat-cards';
import { TooltipCell } from '../components/tooltip-cell';
import { buildVarietyTooltip, countBoothsNeedingDistribution, formatBoothDate, formatTimeRange } from '../format-utils';

function BoothScoutAllocations({ booth, scouts }: { booth: BoothReservationImported; scouts: Record<string, Scout> }) {
  if (!scouts) return null;

  const scoutNames: string[] = [];
  for (const [name, scout] of Object.entries(scouts)) {
    if (scout.isSiteOrder) continue;
    const boothAllocations = scout.$allocationsByChannel.booth;
    const hasMatch = boothAllocations.some((a) => {
      const storeMatch = (a.storeName || '').toLowerCase() === (booth.booth.storeName || '').toLowerCase();
      return storeMatch && a.date === booth.timeslot.date;
    });
    if (hasMatch) scoutNames.push(name);
  }

  if (scoutNames.length === 0) {
    return (
      <div class="booth-detail-content muted-text">No scout allocations yet. Distribute in Smart Cookie to see per-scout breakdown.</div>
    );
  }

  scoutNames.sort((a, b) => a.localeCompare(b));

  return (
    <div class="booth-detail-content">
      {scoutNames.map((name) => (
        <div key={name} class="booth-allocation-chip">
          <strong>{name}</strong>
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
      <h3>Booth Reservations & Sales</h3>

      <StatCards
        stats={[
          { label: 'Reservations', value: totalReservations, description: 'Total booth slots', color: '#1565C0' },
          { label: 'Distributed', value: distributed, description: 'Allocations complete', color: '#2E7D32' },
          {
            label: 'Needs Distribution',
            value: pastNotDistributed,
            description: 'Past booths pending',
            color: pastNotDistributed > 0 ? '#ff9800' : '#999'
          },
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

            const boothDate = r.timeslot.date ? new Date(r.timeslot.date) : null;
            const isFuture = boothDate && boothDate >= today;

            let statusText: string, statusClass: string;
            if (r.booth.isDistributed) {
              statusText = 'Distributed';
              statusClass = 'status-success';
            } else if (isFuture) {
              statusText = 'Upcoming';
              statusClass = 'muted-text';
            } else {
              statusText = 'Not Distributed';
              statusClass = 'status-warning';
            }

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
