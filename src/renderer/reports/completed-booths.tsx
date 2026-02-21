// Completed Booths Report — shows distributed and needs-distribution booths

import { COOKIE_TYPE } from '../../cookie-constants';
import type { BoothReservationImported, Scout, UnifiedDataset } from '../../types';
import { BoothInfoRow } from '../components/booth-info-row';
import { DataTable } from '../components/data-table';
import { ExpandableRow } from '../components/expandable-row';
import { ScoutCreditChips } from '../components/scout-credit-chips';
import { STAT_COLORS, type Stat, StatCards } from '../components/stat-cards';
import { TooltipCell } from '../components/tooltip-cell';
import {
  boothTypeClass,
  buildVarietyTooltip,
  formatBoothTime,
  formatShortDate,
  isVirtualBooth,
  parseLocalDate,
  parseTimeToMinutes,
  todayMidnight
} from '../format-utils';

// ============================================================================
// Helpers
// ============================================================================

function getBoothStatus(r: BoothReservationImported, todayLocal: Date, nowMinutes: number): { text: string; className: string } {
  if (r.booth.isDistributed) return { text: 'Completed', className: 'status-success' };

  const boothDate = r.timeslot.date ? parseLocalDate(r.timeslot.date) : null;
  if (!boothDate) return { text: 'Pending Distribution', className: 'status-warning' };

  const isToday = boothDate.getTime() === todayLocal.getTime();
  const isFuture = boothDate > todayLocal;

  if (isFuture) return { text: 'Upcoming', className: 'muted-text' };

  if (isToday) {
    const startMin = parseTimeToMinutes(r.timeslot.startTime || '');
    const endMin = parseTimeToMinutes(r.timeslot.endTime || '');
    if (startMin >= 0 && nowMinutes < startMin) return { text: 'Today', className: 'status-info' };
    if (endMin >= 0 && nowMinutes < endMin) return { text: 'In Progress', className: 'status-info' };
  }

  return { text: 'Pending Distribution', className: 'status-warning' };
}

function classifyBooths(data: UnifiedDataset) {
  const boothReservations = data.boothReservations || [];

  const nonVirtualReservations = boothReservations.filter((r) => !isVirtualBooth(r.booth.reservationType));

  const now = new Date();
  const todayLocal = todayMidnight();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const completed = nonVirtualReservations.filter((r) => r.booth.isDistributed);
  const needsDistribution = nonVirtualReservations.filter((r) => {
    if (r.booth.isDistributed) return false;
    return getBoothStatus(r, todayLocal, nowMinutes).text === 'Pending Distribution';
  });
  completed.sort((a, b) => (a.timeslot.date || '').localeCompare(b.timeslot.date || ''));
  needsDistribution.sort((a, b) => (a.timeslot.date || '').localeCompare(b.timeslot.date || ''));

  return { completed, needsDistribution };
}

// ============================================================================
// Sub-components
// ============================================================================

function BoothScoutAllocations({ booth, scouts }: { booth: BoothReservationImported; scouts: Record<string, Scout> }) {
  if (!scouts) return null;

  const scoutCredits: Array<{ name: string; total: number }> = [];
  for (const [name, scout] of Object.entries(scouts)) {
    if (scout.isSiteOrder) continue;
    const matching = scout.$allocationsByChannel.booth.filter((a) => {
      const storeMatch = (a.storeName || '').toLowerCase() === (booth.booth.storeName || '').toLowerCase();
      return storeMatch && a.date === booth.timeslot.date;
    });
    if (matching.length > 0) {
      const total = matching.reduce((sum, a) => sum + a.packages + a.donations, 0);
      scoutCredits.push({ name, total });
    }
  }

  return <ScoutCreditChips credits={scoutCredits} unit="sale" />;
}

function CompletedBoothsSection({
  booths,
  scouts,
  showHeader
}: {
  booths: BoothReservationImported[];
  scouts: Record<string, Scout>;
  showHeader?: boolean;
}) {
  if (booths.length === 0) return null;
  return (
    <>
      {showHeader && <h4>Distributed Booths</h4>}
      <DataTable
        columns={['', 'Store', 'Type', 'Date', 'Time', 'Packages', 'Donations', '']}
        columnAligns={[undefined, undefined, 'center', undefined, undefined, 'center', 'center', undefined]}
        className="table-normal booth-table"
        hint="Click on any booth to see scouts who attended that booth."
      >
        {booths.map((r) => {
          const timeDisplay = formatBoothTime(r.timeslot.startTime, r.timeslot.endTime);
          const donations = r.cookies?.[COOKIE_TYPE.COOKIE_SHARE] || 0;
          const physicalPackages = r.physicalPackages;
          const physicalCookies = { ...r.cookies };
          delete physicalCookies[COOKIE_TYPE.COOKIE_SHARE];
          const tip = buildVarietyTooltip(physicalCookies);

          return (
            <ExpandableRow
              key={r.id}
              rowClass="booth-row"
              separateCaret
              firstCell={
                <>
                  <strong>{r.booth.storeName || '-'}</strong>
                  {r.booth.address && <div class="booth-address">{r.booth.address}</div>}
                </>
              }
              cells={[
                <span class={`booth-type-badge ${boothTypeClass(r.booth.reservationType)}`}>{r.booth.reservationType || '-'}</span>,
                r.timeslot.date ? formatShortDate(r.timeslot.date) : '-',
                timeDisplay,
                tip ? (
                  <TooltipCell tooltip={tip} tag="span" className="tooltip-cell">
                    {physicalPackages}
                  </TooltipCell>
                ) : (
                  physicalPackages
                ),
                donations > 0 ? donations : '\u2014',
                ''
              ]}
              cellAligns={['center', undefined, undefined, 'center', 'center', undefined]}
              detail={<BoothScoutAllocations booth={r} scouts={scouts} />}
              colSpan={8}
              detailClass="detail-row"
            />
          );
        })}
      </DataTable>
    </>
  );
}

function NeedsDistributionSection({ booths, hasBoothSaleWarning }: { booths: BoothReservationImported[]; hasBoothSaleWarning: boolean }) {
  const totalNeedsDist = booths.length + (hasBoothSaleWarning ? 1 : 0);
  if (totalNeedsDist === 0) return null;
  return (
    <>
      <div class="report-header-row report-subsection">
        <h4>Pending Distribution</h4>
        <span class="report-status-badge report-status-warning">
          {totalNeedsDist} booth{totalNeedsDist === 1 ? '' : 's'} pending distribution
          <TooltipCell
            tooltip={'Distribute in Smart Cookie\n(Booth \u2192 My Reservations \u2192 booth row \u2192 "...")'}
            tag="span"
            className="help-circle"
          >
            ?
          </TooltipCell>
        </span>
      </div>
      {booths.length > 0 && (
        <DataTable
          columns={['Store', 'Type', 'Date', 'Time']}
          columnAligns={[undefined, 'center', undefined, undefined]}
          className="table-normal booth-table"
        >
          {booths.map((r) => (
            <BoothInfoRow key={r.id} reservation={r} />
          ))}
        </DataTable>
      )}
    </>
  );
}

// ============================================================================
// Main report
// ============================================================================

export function CompletedBoothsReport({ data }: { data: UnifiedDataset }) {
  const booths = classifyBooths(data);

  const totalPackages = booths.completed.reduce((sum, r) => sum + r.physicalPackages, 0);
  const totalDonations = booths.completed.reduce((sum, r) => sum + (r.cookies?.[COOKIE_TYPE.COOKIE_SHARE] || 0), 0);

  const stats: Stat[] = [
    { label: 'Completed', value: booths.completed.length, description: 'Distributed booths', color: STAT_COLORS.TEAL },
    { label: 'Packages Sold', value: totalPackages, description: 'Total booth packages', color: STAT_COLORS.BLUE },
    ...(totalDonations > 0
      ? [{ label: 'Donations', value: totalDonations, description: 'Booth cookie shares', color: STAT_COLORS.PURPLE }]
      : []),
    ...(booths.needsDistribution.length > 0
      ? [
          {
            label: 'Pending Distribution',
            value: booths.needsDistribution.length,
            description: 'Past booths not yet distributed',
            color: STAT_COLORS.ORANGE
          }
        ]
      : [])
  ];

  const hasWarning = booths.needsDistribution.length > 0 || data.siteOrders.boothSale.hasWarning;

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>Completed Booths</h3>
        <span class={`report-status-badge ${hasWarning ? 'report-status-warning' : 'report-status-ok'}`}>
          {hasWarning ? 'Action Required' : 'Fully Distributed'}
        </span>
      </div>
      <StatCards stats={stats} />
      <NeedsDistributionSection booths={booths.needsDistribution} hasBoothSaleWarning={data.siteOrders.boothSale.hasWarning} />
      <CompletedBoothsSection booths={booths.completed} scouts={data.scouts} showHeader={booths.needsDistribution.length > 0} />
      {booths.completed.length === 0 && booths.needsDistribution.length === 0 && <p class="muted-text">No completed or past booths yet.</p>}
    </div>
  );
}
