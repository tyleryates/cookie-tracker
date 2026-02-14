// ReportsSection — TabBar and ReportContent components, health banner, report rendering

import type { AppConfig, DayFilter, UnifiedDataset } from '../../types';
import { countBoothsNeedingDistribution } from '../format-utils';
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

interface TabBarProps {
  activeReport: string | null;
  unified: UnifiedDataset | null;
  appConfig: AppConfig | null;
  onSelectReport: (type: string) => void;
}

interface ReportContentProps {
  activeReport: string | null;
  unified: UnifiedDataset | null;
  appConfig: AppConfig | null;
  boothSyncing: boolean;
  boothResetKey: number;
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
  const count = countBoothsNeedingDistribution(unified?.boothReservations || []);
  return count > 0 ? '\u26A0\uFE0F Booths' : 'Booths';
}

function getScoutWarningLabel(unified: UnifiedDataset | null): string {
  const hasNegativeInventory = (unified?.troopTotals?.scouts?.withNegativeInventory ?? 0) > 0;
  const hasUnallocated =
    unified?.siteOrders?.directShip?.hasWarning ||
    unified?.siteOrders?.girlDelivery?.hasWarning ||
    unified?.siteOrders?.boothSale?.hasWarning;
  return hasNegativeInventory || hasUnallocated ? '\u26A0\uFE0F Scouts' : 'Scouts';
}

function getDonationWarningLabel(unified: UnifiedDataset | null): string {
  return unified?.cookieShare?.reconciled ? 'Donations' : '\u26A0\uFE0F Donations';
}

function getAvailableBoothsWarningLabel(unified: UnifiedDataset | null, appConfig: AppConfig | null): string {
  const boothLocations = unified?.boothLocations || [];
  const filters = appConfig?.boothDayFilters || [];
  const ignored = appConfig?.ignoredTimeSlots || [];
  const count = countAvailableSlots(boothLocations, filters, ignored);
  return count > 0 ? '\u26A0\uFE0F Find Booths' : 'Find Booths';
}

// ============================================================================
// REPORT BUTTONS CONFIG
// ============================================================================

const REPORT_BUTTONS: ReportButton[] = [
  { type: 'troop', label: 'Summary' },
  { type: 'summary', label: 'Scouts', getWarning: (u) => getScoutWarningLabel(u) },
  { type: 'booth', label: 'Booths', getWarning: (u) => getBoothWarningLabel(u) },
  { type: 'donation-alert', label: 'Donations', getWarning: (u) => getDonationWarningLabel(u) },
  { type: 'inventory', label: 'Inventory' },
  { type: 'variety', label: 'Cookie Popularity' }
];

const TOOL_BUTTONS: ReportButton[] = [
  { type: 'available-booths', label: 'Find Booths', getWarning: (u, c) => getAvailableBoothsWarningLabel(u, c) }
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
        {details && details.length > 20 && <p style={{ margin: '8px 0 0' }}>{`\u2026and ${details.length - 20} more`}</p>}
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
// TAB BAR
// ============================================================================

export function TabBar({ activeReport, unified, appConfig, onSelectReport }: TabBarProps) {
  const hasData = !!unified;
  const unknownTypes = unified?.metadata?.healthChecks?.unknownOrderTypes || 0;
  const isBlocked = unknownTypes > 0;
  const visibleTools = TOOL_BUTTONS.filter((btn) => btn.type !== 'available-booths' || appConfig?.availableBoothsEnabled);

  return (
    <nav class="tab-bar">
      {REPORT_BUTTONS.map((btn) => {
        const displayLabel = hasData && btn.getWarning ? btn.getWarning(unified, appConfig) : btn.label;

        return (
          <button
            type="button"
            key={btn.type}
            class={`tab-bar-item${activeReport === btn.type ? ' active' : ''}`}
            disabled={!hasData || isBlocked}
            onClick={() => onSelectReport(btn.type)}
          >
            {displayLabel}
          </button>
        );
      })}
      {visibleTools.map((btn, i) => {
        const displayLabel = hasData && btn.getWarning ? btn.getWarning(unified, appConfig) : btn.label;

        return (
          <button
            type="button"
            key={btn.type}
            class={`tab-bar-item${activeReport === btn.type ? ' active' : ''}`}
            style={i === 0 ? { marginLeft: 'auto' } : undefined}
            disabled={!hasData || isBlocked}
            onClick={() => onSelectReport(btn.type)}
          >
            {displayLabel}
          </button>
        );
      })}
      <button
        type="button"
        class={`tab-bar-item${activeReport === 'sync' ? ' active' : ''}`}
        style={visibleTools.length === 0 ? { marginLeft: 'auto' } : undefined}
        onClick={() => onSelectReport('sync')}
      >
        Status
      </button>
    </nav>
  );
}

// ============================================================================
// REPORT CONTENT
// ============================================================================

export function ReportContent({
  activeReport,
  unified,
  appConfig,
  boothSyncing,
  boothResetKey,
  onIgnoreSlot,
  onResetIgnored,
  onRefreshBooths,
  onSaveBoothIds,
  onSaveDayFilters
}: ReportContentProps) {
  const unknownTypes = unified?.metadata?.healthChecks?.unknownOrderTypes || 0;
  const unknownCookieIds = unified?.metadata?.healthChecks?.unknownCookieIds || 0;
  const isBlocked = unknownTypes > 0;

  if (isBlocked) {
    return (
      <div class="report-container">
        <HealthBanner
          level="error"
          title="Blocked: Unknown Order Types Detected"
          message={`Found ${unknownTypes} unknown Digital Cookie order type(s). Update classification rules before viewing reports.`}
          details={unified?.warnings || []}
        />
      </div>
    );
  }

  if (!activeReport || !unified) return null;

  return (
    <div class="report-container">
      {unknownCookieIds > 0 && (
        <HealthBanner
          level="warning"
          title="Unknown Cookie IDs"
          message={`Found ${unknownCookieIds} unknown cookie ID(s) in Smart Cookie data. These packages are counted in totals but missing from variety breakdowns. Update COOKIE_ID_MAP in cookie-constants.ts.`}
          details={unified.warnings?.filter((w) => w.type === 'UNKNOWN_COOKIE_ID') || []}
        />
      )}
      {renderReport(
        activeReport,
        unified,
        appConfig,
        boothSyncing,
        onIgnoreSlot,
        onResetIgnored,
        onRefreshBooths,
        onSaveBoothIds,
        onSaveDayFilters,
        boothResetKey
      )}
    </div>
  );
}
