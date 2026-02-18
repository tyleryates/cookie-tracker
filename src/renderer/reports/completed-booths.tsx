// Completed Booths Report — shows distributed and needs-distribution booths

import type { ComponentChildren } from 'preact';
import { COOKIE_TYPE } from '../../cookie-constants';
import type { BoothReservationImported, Scout, UnifiedDataset } from '../../types';
import { DataTable } from '../components/data-table';
import { ExpandableRow } from '../components/expandable-row';
import { ScoutCreditChips } from '../components/scout-credit-chips';
import { STAT_COLORS, type Stat, StatCards } from '../components/stat-cards';
import { TooltipCell } from '../components/tooltip-cell';
import {
  boothTypeClass,
  buildVarietyTooltip,
  countBoothsNeedingDistribution,
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
  if (!boothDate) return { text: 'Needs Distribution', className: 'status-warning' };

  const isToday = boothDate.getTime() === todayLocal.getTime();
  const isFuture = boothDate > todayLocal;

  if (isFuture) return { text: 'Upcoming', className: 'muted-text' };

  if (isToday) {
    const startMin = parseTimeToMinutes(r.timeslot.startTime || '');
    const endMin = parseTimeToMinutes(r.timeslot.endTime || '');
    if (startMin >= 0 && nowMinutes < startMin) return { text: 'Today', className: 'status-info' };
    if (endMin >= 0 && nowMinutes < endMin) return { text: 'In Progress', className: 'status-info' };
  }

  return { text: 'Needs Distribution', className: 'status-warning' };
}

function classifyBooths(data: UnifiedDataset) {
  const boothReservations = data.boothReservations || [];

  const nonVirtualReservations = boothReservations.filter((r) => !isVirtualBooth(r.booth.reservationType));

  const now = new Date();
  const todayLocal = todayMidnight();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const pastNotDistributed = countBoothsNeedingDistribution(boothReservations);

  const completed = nonVirtualReservations.filter((r) => r.booth.isDistributed);
  const needsDistribution = nonVirtualReservations.filter((r) => {
    if (r.booth.isDistributed) return false;
    return getBoothStatus(r, todayLocal, nowMinutes).text === 'Needs Distribution';
  });
  completed.sort((a, b) => (a.timeslot.date || '').localeCompare(b.timeslot.date || ''));
  needsDistribution.sort((a, b) => (a.timeslot.date || '').localeCompare(b.timeslot.date || ''));

  return { completed, needsDistribution, pastNotDistributed };
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

function CompletedBoothsSection({ booths, scouts }: { booths: BoothReservationImported[]; scouts: Record<string, Scout> }) {
  if (booths.length === 0) return null;
  return (
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
  );
}

function NeedsDistributionSection({ booths }: { booths: BoothReservationImported[] }) {
  if (booths.length === 0) return null;
  return (
    <>
      <h4>Needs Distribution</h4>
      <DataTable
        columns={['Store', 'Type', 'Date', 'Time', 'Status']}
        columnAligns={[undefined, 'center', undefined, undefined, 'center']}
        className="table-normal booth-table"
        hint="These booths are past but haven't been distributed in Smart Cookie."
      >
        {booths.map((r) => {
          const timeDisplay = formatBoothTime(r.timeslot.startTime, r.timeslot.endTime);
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
              <td>{timeDisplay}</td>
              <td class="text-center">
                <span class="status-pill status-pill-warning">Needs Distribution</span>
              </td>
            </tr>
          );
        })}
      </DataTable>
    </>
  );
}

// ============================================================================
// Main report
// ============================================================================

export function CompletedBoothsReport({ data, banner }: { data: UnifiedDataset; banner?: ComponentChildren }) {
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
            label: 'Needs Distribution',
            value: booths.needsDistribution.length,
            description: 'Past booths not yet distributed',
            color: STAT_COLORS.ORANGE
          }
        ]
      : [])
  ];

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>Completed Booths</h3>
      </div>
      {banner}
      <StatCards stats={stats} />
      {(booths.pastNotDistributed > 0 || data.siteOrders.boothSale.hasWarning) && (
        <div class="info-box info-box-warning" style={{ marginTop: '16px' }}>
          {booths.pastNotDistributed > 0 && (
            <p>
              <strong>
                {booths.pastNotDistributed} booth{booths.pastNotDistributed === 1 ? '' : 's'} needs distribution
              </strong>{' '}
              — allocate cookies in Smart Cookie.
            </p>
          )}
          {data.siteOrders.boothSale.hasWarning && (
            <p style={booths.pastNotDistributed > 0 ? { marginTop: '8px' } : undefined}>
              <strong>
                Booth Sale: {data.siteOrders.boothSale.unallocated} of {data.siteOrders.boothSale.total} packages unallocated
              </strong>{' '}
              — use <strong>Booth Divider</strong> (Booth &rarr; My Reservations &rarr; booth row &rarr; "...")
            </p>
          )}
        </div>
      )}
      <CompletedBoothsSection booths={booths.completed} scouts={data.scouts} />
      <NeedsDistributionSection booths={booths.needsDistribution} />
      {booths.completed.length === 0 && booths.needsDistribution.length === 0 && <p class="muted-text">No completed or past booths yet.</p>}
    </div>
  );
}
