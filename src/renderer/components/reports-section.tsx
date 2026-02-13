// ReportsSection — Report button bar, report container, and health banner

import { useRef } from 'preact/hooks';
import type { AppConfig, BoothReservationImported, DayFilter, UnifiedDataset } from '../../types';
import { AvailableBoothsReport, countAvailableSlots } from '../reports/available-booths';
import { BoothReport } from '../reports/booth';
import { DonationAlertReport } from '../reports/donation-alert';
import { InventoryReport } from '../reports/inventory';
import { ScoutSummaryReport } from '../reports/scout-summary';
import { TroopSummaryReport } from '../reports/troop-summary';
import { VarietyReport } from '../reports/variety';

// ============================================================================
// TYPES
// ============================================================================

interface ReportsSectionProps {
  activeReport: string | null;
  unified: UnifiedDataset | null;
  appConfig: AppConfig | null;
  boothSyncing: boolean;
  onSelectReport: (type: string) => void;
  onIgnoreSlot: (boothId: number, date: string, startTime: string) => void;
  onResetIgnored: () => void;
  onRefreshBooths: () => void;
  onSaveBoothIds: (ids: number[]) => void;
  onSaveDayFilters: (filters: DayFilter[]) => void;
}

interface ReportButton {
  type: string;
  label: string;
  getWarning?: (unified: UnifiedDataset | null, appConfig: AppConfig | null) => string;
}

// ============================================================================
// WARNING LABEL HELPERS
// ============================================================================

function getBoothWarningLabel(unified: UnifiedDataset | null): string {
  const boothReservations = unified?.boothReservations || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pastNeedingDistribution = boothReservations.filter((r: BoothReservationImported) => {
    const type = (r.booth.reservationType || '').toLowerCase();
    if (type.includes('virtual')) return false;
    if (r.booth.isDistributed) return false;
    const d = r.timeslot.date ? new Date(r.timeslot.date) : null;
    return !d || d < today;
  }).length;

  return pastNeedingDistribution > 0 ? '⚠️ Booths' : 'Booths';
}

function getScoutWarningLabel(unified: UnifiedDataset | null): string {
  const hasNegativeInventory = (unified?.troopTotals?.scouts?.withNegativeInventory ?? 0) > 0;
  const hasUnallocated =
    unified?.siteOrders?.directShip?.hasWarning ||
    unified?.siteOrders?.girlDelivery?.hasWarning ||
    unified?.siteOrders?.boothSale?.hasWarning;
  return hasNegativeInventory || hasUnallocated ? '⚠️ Scouts' : 'Scouts';
}

function getDonationWarningLabel(unified: UnifiedDataset | null): string {
  return unified?.cookieShare?.reconciled ? 'Donations' : '⚠️ Donations';
}

function getAvailableBoothsWarningLabel(unified: UnifiedDataset | null, appConfig: AppConfig | null): string {
  const boothLocations = unified?.boothLocations || [];
  const filters = appConfig?.boothDayFilters || [];
  const ignored = appConfig?.ignoredTimeSlots || [];
  const count = countAvailableSlots(boothLocations, filters, ignored);
  return count > 0 ? '⚠️ Available Booths' : 'Available Booths';
}

// ============================================================================
// REPORT BUTTONS CONFIG
// ============================================================================

const REPORT_BUTTONS: ReportButton[] = [
  { type: 'troop', label: 'Troop' },
  { type: 'summary', label: 'Scouts', getWarning: (u) => getScoutWarningLabel(u) },
  { type: 'donation-alert', label: 'Donations', getWarning: (u) => getDonationWarningLabel(u) },
  { type: 'booth', label: 'Booths', getWarning: (u) => getBoothWarningLabel(u) },
  { type: 'available-booths', label: 'Available Booths', getWarning: (u, c) => getAvailableBoothsWarningLabel(u, c) },
  { type: 'inventory', label: 'Inventory' },
  { type: 'variety', label: 'Cookies' }
];

// ============================================================================
// HEALTH BANNER
// ============================================================================

function HealthBanner({
  level,
  title,
  message,
  details
}: {
  level: string;
  title: string;
  message: string;
  details?: Array<{ type: string; message?: string }>;
}) {
  const isError = level === 'error';
  const bannerStyle = {
    padding: '15px',
    borderRadius: '8px',
    background: isError ? '#FFEBEE' : '#FFF8E1',
    borderLeft: isError ? '4px solid #C62828' : '4px solid #F57F17',
    color: isError ? '#B71C1C' : '#E65100'
  };

  return (
    <div class="report-visual">
      <div style={bannerStyle}>
        <strong>{title}</strong>
        <p style={{ margin: '8px 0 0' }}>{message}</p>
        {details && details.length > 0 && (
          <pre style={{ margin: '10px 0 0', whiteSpace: 'pre-wrap' }}>{JSON.stringify(details.slice(0, 20), null, 2)}</pre>
        )}
        {details && details.length > 20 && <p style={{ margin: '8px 0 0' }}>{`…and ${details.length - 20} more`}</p>}
      </div>
    </div>
  );
}

// ============================================================================
// REPORT RENDERING
// ============================================================================

function renderReport(
  type: string,
  unified: UnifiedDataset,
  appConfig: AppConfig | null,
  boothSyncing: boolean,
  onIgnoreSlot: (boothId: number, date: string, startTime: string) => void,
  onResetIgnored: () => void,
  onRefreshBooths: () => void,
  onSaveBoothIds: (ids: number[]) => void,
  onSaveDayFilters: (filters: DayFilter[]) => void,
  boothResetKey?: number
) {
  switch (type) {
    case 'troop':
      return <TroopSummaryReport data={unified} />;
    case 'inventory':
      return <InventoryReport data={unified} />;
    case 'summary':
      return <ScoutSummaryReport data={unified} />;
    case 'variety':
      return <VarietyReport data={unified} />;
    case 'donation-alert':
      return <DonationAlertReport data={unified} />;
    case 'booth':
      return <BoothReport data={unified} />;
    case 'available-booths':
      return (
        <AvailableBoothsReport
          key={boothResetKey}
          data={unified}
          config={{
            filters: appConfig?.boothDayFilters || [],
            ignoredTimeSlots: appConfig?.ignoredTimeSlots || []
          }}
          appConfig={appConfig}
          refreshing={boothSyncing}
          onIgnoreSlot={onIgnoreSlot}
          onResetIgnored={onResetIgnored}
          onRefresh={onRefreshBooths}
          onSaveBoothIds={onSaveBoothIds}
          onSaveDayFilters={onSaveDayFilters}
        />
      );
    default:
      return null;
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ReportsSection({
  activeReport,
  unified,
  appConfig,
  boothSyncing,
  onSelectReport,
  onIgnoreSlot,
  onResetIgnored,
  onRefreshBooths,
  onSaveBoothIds,
  onSaveDayFilters
}: ReportsSectionProps) {
  const unknownTypes = unified?.metadata?.healthChecks?.unknownOrderTypes || 0;
  const unknownCookieIds = unified?.metadata?.healthChecks?.unknownCookieIds || 0;
  const hasData = !!unified;
  const isBlocked = unknownTypes > 0;

  // Clicking "Available Booths" while already on that report resets sub-views (selector/filter)
  const boothResetKeyRef = useRef(0);
  const handleSelectReport = (type: string) => {
    if (type === 'available-booths' && activeReport === 'available-booths') {
      boothResetKeyRef.current += 1;
    }
    onSelectReport(type);
  };

  return (
    <section class="reports-section">
      <h2>Reports</h2>
      <div class="button-group">
        {REPORT_BUTTONS.filter((btn) => btn.type !== 'available-booths' || appConfig?.availableBoothsEnabled).map((btn) => {
          const displayLabel = hasData && btn.getWarning ? btn.getWarning(unified, appConfig) : btn.label;

          return (
            <button
              type="button"
              key={btn.type}
              class={`btn btn-secondary${activeReport === btn.type ? ' active' : ''}`}
              disabled={!hasData || isBlocked}
              onClick={() => handleSelectReport(btn.type)}
            >
              {displayLabel}
            </button>
          );
        })}
      </div>

      <div class={`report-container${activeReport ? ' show' : ''}`}>
        {isBlocked ? (
          <HealthBanner
            level="error"
            title="Blocked: Unknown Order Types Detected"
            message={`Found ${unknownTypes} unknown Digital Cookie order type(s). Update classification rules before viewing reports.`}
            details={unified?.warnings || []}
          />
        ) : unknownCookieIds > 0 ? (
          <>
            <HealthBanner
              level="warning"
              title="Unknown Cookie IDs"
              message={`Found ${unknownCookieIds} unknown cookie ID(s) in Smart Cookie data. These packages are counted in totals but missing from variety breakdowns. Update COOKIE_ID_MAP in cookie-constants.ts.`}
              details={unified?.warnings?.filter((w) => w.type === 'UNKNOWN_COOKIE_ID') || []}
            />
            {activeReport &&
              unified &&
              renderReport(
                activeReport,
                unified,
                appConfig,
                boothSyncing,
                onIgnoreSlot,
                onResetIgnored,
                onRefreshBooths,
                onSaveBoothIds,
                onSaveDayFilters,
                boothResetKeyRef.current
              )}
          </>
        ) : (
          activeReport &&
          unified &&
          renderReport(
            activeReport,
            unified,
            appConfig,
            boothSyncing,
            onIgnoreSlot,
            onResetIgnored,
            onRefreshBooths,
            onSaveBoothIds,
            onSaveDayFilters
          )
        )}
      </div>
    </section>
  );
}
