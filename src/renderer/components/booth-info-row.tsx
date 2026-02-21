// Shared booth row component used by completed-booths and upcoming-booths reports

import type { BoothReservationImported } from '../../types';
import { boothTypeClass, formatBoothTime, formatShortDate } from '../format-utils';

/** Renders a table row with store name, address, booth type badge, date, and time */
export function BoothInfoRow({ reservation }: { reservation: BoothReservationImported }) {
  return (
    <tr key={reservation.id}>
      <td>
        <strong>{reservation.booth.storeName || '-'}</strong>
        {reservation.booth.address && <div class="booth-address">{reservation.booth.address}</div>}
      </td>
      <td class="text-center">
        <span class={`booth-type-badge ${boothTypeClass(reservation.booth.reservationType)}`}>
          {reservation.booth.reservationType || '-'}
        </span>
      </td>
      <td>{reservation.timeslot.date ? formatShortDate(reservation.timeslot.date) : '-'}</td>
      <td>{formatBoothTime(reservation.timeslot.startTime, reservation.timeslot.endTime)}</td>
    </tr>
  );
}
