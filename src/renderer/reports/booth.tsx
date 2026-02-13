import { BOOTH_RESERVATION_TYPE } from '../../constants';
import { COOKIE_TYPE, getCookieDisplayName } from '../../cookie-constants';
import type { BoothReservationImported, Scout, UnifiedDataset } from '../../types';
import { DataTable } from '../components/data-table';
import { ExpandableRow } from '../components/expandable-row';
import { StatCards } from '../components/stat-cards';
import { TooltipCell } from '../components/tooltip-cell';
import { buildVarietyTooltip, formatDate, formatTimeRange } from '../format-utils';

function BoothScoutAllocations({ booth, scouts }: { booth: BoothReservationImported; scouts: Record<string, Scout> }) {
  if (!scouts) return null;

  const scoutsForBooth: Array<{ name: string; packages: number; donations: number }> = [];
  for (const [name, scout] of Object.entries(scouts)) {
    if (scout.isSiteOrder) continue;
    const boothAllocations = scout.$allocationsByChannel.booth;
    const matchingAllocations = boothAllocations.filter((a) => {
      const storeMatch = (a.storeName || '').toLowerCase() === (booth.booth.storeName || '').toLowerCase();
      const dateMatch = a.date === booth.timeslot.date;
      return storeMatch && dateMatch;
    });

    if (matchingAllocations.length > 0) {
      const totalPackages = matchingAllocations.reduce((sum: number, a) => sum + (a.packages || 0), 0);
      const totalDonations = matchingAllocations.reduce((sum: number, a) => sum + (a.donations || 0), 0);
      scoutsForBooth.push({ name, packages: totalPackages, donations: totalDonations });
    }
  }

  if (scoutsForBooth.length === 0) {
    return (
      <div class="booth-detail-content muted-text">
        No scout allocations yet. Distribute in Smart Cookie to see per-scout breakdown.
      </div>
    );
  }

  scoutsForBooth.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div class="booth-detail-content">
      <table class="booth-allocation-table">
        {scoutsForBooth.map(({ name, packages, donations }) => (
          <tr key={name}>
            <td class="booth-allocation-name"><strong>{name}</strong></td>
            <td class="booth-allocation-detail">{packages} packages</td>
            <td class="booth-allocation-detail">{donations > 0 ? `${donations} donations` : ''}</td>
          </tr>
        ))}
      </table>
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pastNotDistributed = nonVirtualReservations.filter((r: BoothReservationImported) => {
    if (r.booth.isDistributed) return false;
    const d = r.timeslot.date ? new Date(r.timeslot.date) : null;
    return !d || d < today;
  }).length;

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
          { label: 'Reservations', value: totalReservations, description: 'Total booth slots', color: '#2196F3' },
          { label: 'Distributed', value: distributed, description: 'Allocations complete', color: '#4CAF50' },
          {
            label: 'Needs Distribution',
            value: pastNotDistributed,
            description: 'Past booths pending',
            color: pastNotDistributed > 0 ? '#ff9800' : '#999'
          },
          { label: 'Booth Sales', value: totalBoothPackages, description: 'Physical cookies', color: '#9C27B0' },
          {
            label: 'Booth Donations',
            value: totalBoothDonations,
            description: getCookieDisplayName(COOKIE_TYPE.COOKIE_SHARE),
            color: totalBoothDonations > 0 ? '#7B1FA2' : '#999'
          }
        ]}
      />

      {nonVirtualReservations.length > 0 && (
        <>
          <h4>Booth Reservations</h4>
          <DataTable
            columns={['', 'Store', 'Date', 'Time', 'Type', 'Packages', 'Donations', 'Status']}
            className="table-normal booth-table"
            hint="Click on any booth to see scout allocations for that booth."
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
                    formatDate(r.timeslot.date),
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
        </>
      )}
    </div>
  );
}
