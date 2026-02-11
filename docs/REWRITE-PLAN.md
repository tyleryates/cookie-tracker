# Application Rewrite Plan

## Architectural Changes

### 1. Typed IPC Layer
**Problem:** Raw string-based `ipcRenderer.invoke('scrape-websites')` with untyped payloads/returns. Adding a channel means updating strings in two places with no compiler help.

**Solution:** Shared `IpcChannels` type map defining every channel's request and response types. Both main and renderer import from it. `typedInvoke<K>()` / `typedHandle<K>()` wrappers provide type safety.

**Files:** `src/ipc-types.ts` (new), `src/main.ts`, `src/renderer/app.tsx`, `src/renderer/data-loader.ts`

### 2. Move Data Processing to Main Process
**Problem:** Renderer loads raw files via IPC, parses Excel, runs all calculators, then saves results — blocking the UI thread during builds. The main process is just a dumb file server.

**Solution:** Main process owns the full pipeline: scan → parse → build unified → return result. Renderer sends `load-data` and receives the finished `UnifiedDataset`. Excel parsing (XLSX) moves to main. Data-loader in renderer becomes a thin IPC call.

**Files:** `src/main.ts`, `src/data-pipeline.ts` (new — orchestrates load+build), `src/renderer/data-loader.ts` (simplified)

### 3. Normalize Allocations into Single Type
**Problem:** Three separate allocation types (`BoothSalesAllocation`, `DirectShipAllocation`, virtual booth as Transfer) with ~80% field overlap. Every function that touches allocations needs three code paths.

**Solution:** Single `Allocation` type with `channel: 'booth' | 'directShip' | 'virtualBooth'` discriminant. Optional fields for channel-specific data (booth info, timeslot, etc). One code path for processing, filtering by channel when needed.

**Files:** `src/types.ts`, `src/data-store.ts`, `src/data-processing/data-importers.ts`, `src/data-processing/calculators/allocation-processing.ts`

### 4. Flatten ScoutCredited → Scout.allocations
**Problem:** `ScoutCredited` has three identical nested structures `{ packages, donations, varieties, allocations[] }` requiring 3+ levels of property access everywhere.

**Solution:** Remove `ScoutCredited`. Store `allocations: Allocation[]` directly on Scout. Provide helper functions: `getAllocations(scout, channel?)`, `allocationTotals(scout, channel)` to aggregate on demand. Reports compute what they need from the flat list.

**Files:** `src/types.ts`, `src/data-processing/calculators/allocation-processing.ts`, `src/data-processing/calculators/scout-calculations.ts`, `src/data-processing/calculators/helpers.ts`, all report components that read `scout.credited.*`

### 5. Separate Session from Scraper
**Problem:** Login state (cookie jar, XSRF token, troopId, meResponse) is tangled into scraper classes. Re-login requires calling `this.login()` internally. The `lastScraper` pattern in main.ts keeps a full scraper alive just for its auth cookies.

**Solution:** Extract `SmartCookieSession` and `DigitalCookieSession` classes that own auth state (cookie jar, tokens, client). Scrapers accept a session, use it for requests. Main process can keep a session alive without a scraper. Session handles re-login transparently.

**Files:** `src/scrapers/dc-session.ts` (new), `src/scrapers/sc-session.ts` (new), `src/scrapers/digital-cookie.ts`, `src/scrapers/smart-cookie.ts`, `src/scrapers/index.ts`, `src/main.ts`

### 6. Request Cancellation
**Problem:** No way to abort a sync mid-flight. Long booth divider fetches (N sequential API calls) block until complete.

**Solution:** Thread `AbortSignal` through scraper methods. Orchestrator creates `AbortController`, exposes `abort()`. Main process handles a `cancel-sync` IPC channel. Each API call checks `signal.aborted` before proceeding.

**Files:** `src/scrapers/digital-cookie.ts`, `src/scrapers/smart-cookie.ts`, `src/scrapers/index.ts`, `src/main.ts`, `src/renderer/app.tsx`

### 7. Batch Booth Divider Fetches
**Problem:** Booth dividers are fetched one-at-a-time in a `for` loop. With 15+ distributed reservations, this is slow.

**Solution:** `Promise.all` with concurrency limiting (e.g., 3 concurrent). Use a simple pool pattern. Respects abort signal.

**Files:** `src/scrapers/smart-cookie.ts`, `src/scrapers/request-utils.ts`

### 8. Reducer-Based State in Renderer
**Problem:** `app.tsx` has 9 `useState` calls plus refs for stable references. State transitions span multiple `setSyncState` / `setStore` / `setStatusMessage` calls that can get out of sync.

**Solution:** `useReducer` with a single `AppState` type and discriminated `Action` union. All state transitions are explicit, testable, and atomic. Side effects stay in `useEffect` / callbacks that dispatch actions.

**Files:** `src/renderer/app.tsx`, `src/renderer/app-reducer.ts` (new)

## Execution Order

Bottom-up by dependency:

1. **Types + IPC contract** — Foundation everything else imports
2. **Auth sessions** — Independent of data layer
3. **Scrapers** — Use new sessions, cancellation, batching
4. **Data store + operations** — New allocation model
5. **Data processing** — Calculators use new types, flatten credited
6. **Data pipeline** — Main-process orchestration
7. **Main process** — Typed IPC handlers, pipeline integration
8. **Renderer reducer** — New state management
9. **Renderer components** — Updated for new types + reducer
10. **Cleanup** — Remove dead files, verify build

## Design Principles (Preserved)

- Smart Cookie is source of truth
- Classify once at import time
- Positive sums only (reports sum allocations, never subtract to infer)
- Reports calculate their own needs from UnifiedDataset
- kebab-case filenames
- Pure functions for data processing
