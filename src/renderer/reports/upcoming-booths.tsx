// Upcoming Booths Report — shows reserved booths that haven't happened yet

import type { ComponentChildren } from 'preact';
import type { UnifiedDataset } from '../../types';
import { DataTable } from '../components/data-table';
import { boothTypeClass, formatBoothTime, formatShortDate, isVirtualBooth, parseLocalDate, todayMidnight } from '../format-utils';

export function UpcomingBoothsReport({ data, banner }: { data: UnifiedDataset; banner?: ComponentChildren }) {
  const nonVirtual = (data.boothReservations || []).filter((r) => !isVirtualBooth(r.booth.reservationType));

  const todayLocal = todayMidnight();

  const upcoming = nonVirtual.filter((r) => {
    if (r.booth.isDistributed) return false;
    const boothDate = parseLocalDate(r.timeslot.date || '');
    return boothDate != null && boothDate >= todayLocal;
  });

  upcoming.sort((a, b) => (a.timeslot.date || '').localeCompare(b.timeslot.date || ''));

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>Upcoming Booths</h3>
      </div>
      {banner}
      {upcoming.length === 0 ? (
        <p class="muted-text">No upcoming booths scheduled.</p>
      ) : (
        <DataTable
          columns={['Store', 'Type', 'Date', 'Time']}
          columnAligns={[undefined, 'center', undefined, undefined]}
          className="table-normal booth-table"
        >
          {upcoming.map((r) => {
            return (
              <tr key={r.id}>
                <td>
                  <strong>{r.booth.storeName || '-'}</strong>
                  {r.booth.address && <div class="booth-address">{r.booth.address}</div>}
                </td>
                <td class="text-center">
                  <span class={`booth-type-badge ${boothTypeClass(r.booth.reservationType)}`}>{r.booth.reservationType || '-'}</span>
                </td>
                <td>{r.timeslot.date ? formatShortDate(r.timeslot.date) : '-'}</td>
                <td>{formatBoothTime(r.timeslot.startTime, r.timeslot.endTime)}</td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}
