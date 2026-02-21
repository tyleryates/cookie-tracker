// ReportsSection — TabBar and ReportContent components, health banner, report rendering

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AppConfig, EndpointSyncState, UnifiedDataset } from '../../types';
import { summarizeAvailableSlots } from '../available-booths-utils';
import { countBoothsNeedingDistribution, isVirtualBooth, parseLocalDate, todayMidnight } from '../format-utils';
import { AvailableBoothsReport } from '../reports/available-booths';
import { CompletedBoothsReport } from '../reports/completed-booths';
import { DonationAlertReport } from '../reports/donation-alert';
import { FinanceReport } from '../reports/finance';
import { InventoryReport } from '../reports/inventory';
import { ScoutInventoryReport } from '../reports/scout-inventory';
import { ScoutSummaryReport } from '../reports/scout-summary';
import { TroopSalesReport } from '../reports/troop-sales';
import { TroopProceedsReport } from '../reports/troop-summary';
import { UpcomingBoothsReport } from '../reports/upcoming-booths';
import { VarietyReport } from '../reports/variety';

// ============================================================================
// TYPES
// ============================================================================

interface TabBarProps {
  activeReport: string | null;
  unified: UnifiedDataset | null;
  appConfig: AppConfig | null;
  todoCount: number;
  warningCount: number;
  onSelectReport: (type: string) => void;
}

interface ReportContentProps {
  activeReport: string | null;
  unified: UnifiedDataset | null;
  appConfig: AppConfig | null;
  boothSyncState: EndpointSyncState;
  boothResetKey: number;
  readOnly: boolean;
  onIgnoreSlot: (boothId: number, date: string, startTime: string) => void;
  onResetIgnored: () => void;
  onRefreshBooths: () => void;
  onSaveBoothIds: (ids: number[]) => void;
  onSaveDayFilters: (filters: string[]) => void;
}

// ============================================================================
// REPORT TABS CONFIG
// ============================================================================

interface ReportTab {
  id: string;
  label: string;
  types: [string, ...string[]];
}

const REPORT_TABS: ReportTab[] = [
  { id: 'troop', label: 'Troop', types: ['inventory', 'troop-sales', 'proceeds'] },
  { id: 'scout', label: 'Scout', types: ['summary', 'scout-inventory', 'finance'] },
  { id: 'booths', label: 'Booths', types: ['completed-booths', 'upcoming-booths'] },
  { id: 'donations', label: 'Donations', types: ['donation-alert'] },
  { id: 'popularity', label: 'Cookie Popularity', types: ['variety'] }
];

// Display names for dropdown items in paired tabs
const REPORT_TYPE_LABELS: Record<string, string> = {
  inventory: 'Inventory & Transfers',
  'troop-sales': 'Online Orders',
  proceeds: 'Proceeds',
  'scout-inventory': 'Inventory',
  summary: 'Sales Summary',
  finance: 'Cash Report',
  'completed-booths': 'Completed Booths',
  'upcoming-booths': 'Upcoming Booths',
  'available-booths': 'Booth Finder'
};

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

  return (
    <div class={`info-box ${isError ? 'info-box-error' : 'info-box-warning'}`}>
      <p>
        <strong>{title}</strong>
      </p>
      <p>{message}</p>
      {details && details.length > 0 && (
        <pre style={{ margin: '10px 0 0', whiteSpace: 'pre-wrap' }}>{JSON.stringify(details.slice(0, 20), null, 2)}</pre>
      )}
      {details && details.length > 20 && <p>{`\u2026and ${details.length - 20} more`}</p>}
    </div>
  );
}

// ============================================================================
// REPORT RENDERING
// ============================================================================

interface RenderReportProps {
  type: string;
  unified: UnifiedDataset;
  appConfig: AppConfig | null;
  boothSyncState: EndpointSyncState;
  readOnly: boolean;
  onIgnoreSlot: (boothId: number, date: string, startTime: string) => void;
  onResetIgnored: () => void;
  onRefreshBooths: () => void;
  onSaveBoothIds: (ids: number[]) => void;
  onSaveDayFilters: (filters: string[]) => void;
  boothResetKey?: number;
}

function renderReport({
  type,
  unified,
  appConfig,
  boothSyncState,
  readOnly,
  onIgnoreSlot,
  onResetIgnored,
  onRefreshBooths,
  onSaveBoothIds,
  onSaveDayFilters,
  boothResetKey
}: RenderReportProps) {
  if (!unified?.scouts) {
    return (
      <div class="report-visual">
        <p>No data available. Please import data first.</p>
      </div>
    );
  }

  switch (type) {
    case 'proceeds':
      return <TroopProceedsReport data={unified} />;
    case 'inventory':
      return <InventoryReport data={unified} />;
    case 'scout-inventory':
      return <ScoutInventoryReport data={unified} />;
    case 'troop-sales':
      return <TroopSalesReport data={unified} />;
    case 'summary':
      return <ScoutSummaryReport data={unified} />;
    case 'variety':
      return <VarietyReport data={unified} />;
    case 'donation-alert':
      return <DonationAlertReport data={unified} />;
    case 'finance':
      return <FinanceReport data={unified} />;
    case 'upcoming-booths':
      return <UpcomingBoothsReport data={unified} />;
    case 'completed-booths':
      return <CompletedBoothsReport data={unified} />;
    case 'available-booths':
      return (
        <AvailableBoothsReport
          key={boothResetKey}
          data={unified}
          config={{
            filters: appConfig?.boothFinder?.dayFilters || [],
            ignoredSlots: appConfig?.boothFinder?.ignoredSlots || []
          }}
          appConfig={appConfig}
          syncState={boothSyncState}
          readOnly={readOnly}
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

function computeDropdownCounts(unified: UnifiedDataset | null, appConfig: AppConfig | null): Record<string, number> {
  if (!unified) return {};
  const counts: Record<string, number> = {};

  // Inventory counts
  const troopInv = unified.troopTotals.inventory;
  if (troopInv > 0) counts.inventory = troopInv;
  const scoutInvTotal = Object.values(unified.scouts)
    .filter((s) => !s.isSiteOrder)
    .reduce((sum, s) => sum + s.totals.inventory, 0);
  if (scoutInvTotal > 0) counts['scout-inventory'] = scoutInvTotal;

  // Site order counts (number of orders, excluding booth sales)
  const siteOrderCount = unified.siteOrders.directShip.orders.length + unified.siteOrders.girlDelivery.orders.length;
  if (siteOrderCount > 0) counts['troop-sales'] = siteOrderCount;

  // Scout order counts
  const scoutOrderCount = Object.values(unified.scouts)
    .filter((s) => !s.isSiteOrder)
    .reduce((sum, s) => sum + s.orders.length, 0);
  if (scoutOrderCount > 0) counts.summary = scoutOrderCount;

  // Booth counts
  const reservations = unified.boothReservations || [];
  const nonVirtual = reservations.filter((r) => !isVirtualBooth(r.booth.reservationType));
  const todayLocal = todayMidnight();
  const completed = nonVirtual.filter((r) => r.booth.isDistributed).length;
  const upcoming = nonVirtual.filter((r) => {
    if (r.booth.isDistributed) return false;
    const boothDate = parseLocalDate(r.timeslot.date || '');
    return boothDate != null && boothDate >= todayLocal;
  }).length;
  const needsDist = countBoothsNeedingDistribution(reservations);
  if (completed + needsDist > 0) counts['completed-booths'] = completed + needsDist;
  if (upcoming > 0) counts['upcoming-booths'] = upcoming;
  const filters = appConfig?.boothFinder?.dayFilters || [];
  const ignored = appConfig?.boothFinder?.ignoredSlots || [];
  const availableSlots = summarizeAvailableSlots(unified.boothLocations || [], filters, ignored).reduce((sum, b) => sum + b.slotCount, 0);
  if (availableSlots > 0) counts['available-booths'] = availableSlots;

  return counts;
}

export function TabBar({ activeReport, unified, appConfig, todoCount, warningCount, onSelectReport }: TabBarProps) {
  const hasData = !!unified;
  const hc = unified?.metadata?.healthChecks;
  const unknownTypes = hc?.unknownOrderTypes || 0;
  const isBlocked = unknownTypes > 0;

  // Compute count badges for dropdown items
  const dropdownCounts = useMemo(() => computeDropdownCounts(unified, appConfig), [unified, appConfig]);

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number } | null>(null);
  const wrapperRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!openDropdown) return;
    const currentId = openDropdown;
    function handleClick(e: MouseEvent) {
      const wrapper = wrapperRefs.current[currentId];
      if (wrapper && !wrapper.contains(e.target as Node)) {
        // Defer close so click events on other elements complete first
        setTimeout(() => setOpenDropdown(null), 0);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openDropdown]);

  function toggleDropdown(tabId: string) {
    if (openDropdown === tabId) {
      setOpenDropdown(null);
      setDropdownPos(null);
      return;
    }
    const wrapper = wrapperRefs.current[tabId];
    if (wrapper) {
      const rect = wrapper.getBoundingClientRect();
      setDropdownPos({ left: rect.left, top: rect.bottom });
    }
    setOpenDropdown(tabId);
  }

  return (
    <nav class="tab-bar">
      {REPORT_TABS.map((tab) => {
        const isActive = activeReport !== null && tab.types.includes(activeReport);
        const isPaired = tab.types.length > 1;
        const disabled = !hasData || isBlocked;

        if (isPaired) {
          return (
            <div
              key={tab.id}
              class="tab-dropdown-wrapper"
              ref={(el) => {
                wrapperRefs.current[tab.id] = el;
              }}
            >
              <button
                type="button"
                class={`tab-bar-item${isActive ? ' active' : ''}`}
                disabled={disabled}
                aria-expanded={openDropdown === tab.id}
                aria-haspopup="true"
                onClick={() => toggleDropdown(tab.id)}
              >
                {tab.label}
                <span style={{ marginLeft: '4px', fontSize: '0.7em' }}>{'\u25BE'}</span>
              </button>
              {openDropdown === tab.id && dropdownPos && (
                <div class="tab-dropdown" role="menu" style={{ left: `${dropdownPos.left}px`, top: `${dropdownPos.top}px` }}>
                  {tab.types.map((type) => {
                    const count = dropdownCounts[type];
                    return (
                      <button
                        type="button"
                        key={type}
                        class={`tab-dropdown-item${activeReport === type ? ' active' : ''}`}
                        onClick={() => {
                          onSelectReport(type);
                          setOpenDropdown(null);
                          setDropdownPos(null);
                        }}
                      >
                        {REPORT_TYPE_LABELS[type] || type}
                        {count != null && <span class="tab-dropdown-count">{count}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        return (
          <button
            type="button"
            key={tab.id}
            class={`tab-bar-item${isActive ? ' active' : ''}`}
            disabled={disabled}
            onClick={() => onSelectReport(tab.types[0])}
          >
            {tab.label}
          </button>
        );
      })}
      {appConfig?.boothFinder?.enabled && (
        <button
          type="button"
          class={`tab-bar-item${activeReport === 'available-booths' ? ' active' : ''}`}
          style={{ marginLeft: 'auto' }}
          disabled={!hasData || isBlocked}
          onClick={() => onSelectReport('available-booths')}
        >
          Booth Finder
          {dropdownCounts['available-booths'] != null && <span class="tab-todo-badge-info">{dropdownCounts['available-booths']}</span>}
        </button>
      )}
      <button
        type="button"
        class={`tab-bar-item${activeReport === 'health-check' ? ' active' : ''}`}
        style={appConfig?.boothFinder?.enabled ? undefined : { marginLeft: 'auto' }}
        disabled={!hasData || isBlocked}
        onClick={() => onSelectReport('health-check')}
      >
        To-Do
        {hasData && (
          <span class={todoCount > 0 ? 'tab-todo-badge' : warningCount > 0 ? 'tab-todo-badge-info' : 'tab-todo-badge-ok'}>
            {todoCount > 0 ? todoCount : warningCount > 0 ? warningCount : 0}
          </span>
        )}
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
  boothSyncState,
  boothResetKey,
  readOnly,
  onIgnoreSlot,
  onResetIgnored,
  onRefreshBooths,
  onSaveBoothIds,
  onSaveDayFilters
}: ReportContentProps) {
  const unknownTypes = unified?.metadata?.healthChecks?.unknownOrderTypes || 0;
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
      {renderReport({
        type: activeReport,
        unified,
        appConfig,
        boothSyncState,
        readOnly,
        onIgnoreSlot,
        onResetIgnored,
        onRefreshBooths,
        onSaveBoothIds,
        onSaveDayFilters,
        boothResetKey
      })}
    </div>
  );
}
