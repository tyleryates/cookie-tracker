// Upcoming Booths Report — shows reserved booths that haven't happened yet

import type { UnifiedDataset } from '../../types';
import { BoothInfoRow } from '../components/booth-info-row';
import { DataTable } from '../components/data-table';
import { isVirtualBooth, parseLocalDate, todayMidnight } from '../format-utils';

export function UpcomingBoothsReport({ data }: { data: UnifiedDataset }) {
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
      {upcoming.length === 0 ? (
        <p class="muted-text">No upcoming booths scheduled.</p>
      ) : (
        <DataTable
          columns={['Store', 'Type', 'Date', 'Time']}
          columnAligns={[undefined, 'center', undefined, undefined]}
          className="table-normal booth-table"
        >
          {upcoming.map((r) => (
            <BoothInfoRow key={r.id} reservation={r} />
          ))}
        </DataTable>
      )}
    </div>
  );
}
