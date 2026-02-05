# Digital Cookie Integration - COMPLETE ✅

## Working Features

### 1. Login Flow
- ✅ GET `/login` - Extract CSRF token from HTML
- ✅ POST `/j_spring_security_check` - Login with credentials
- ✅ Session cookies maintained automatically (JSESSIONID, acceleratorSecureGUID)

### 2. Role Selection
- ✅ GET `/select-role` - Fetch available roles
- ✅ Parse HTML to extract role options and IDs
- ✅ Match role name exactly (e.g., "Troop 1234 of Service Unit 567")
- ✅ GET `/select-role?id={roleId}` - Select the matched role

### 3. Export Download
- ✅ Extract troopId and serviceUnitId from role name
- ✅ GET `/ajaxCall/generateReport?reportType=TROOP_ORDER_REPORT&troopId={id}&serviceUnitId={id}&councilId={id}`
- ✅ Parse JSON response to get fileName
- ✅ GET `/ajaxCall/downloadFile/TROOP_ORDER_REPORT/{fileName}`
- ✅ Save Excel file to data directory as `DC-{date}.xlsx`

### Data Storage Locations

**Production (packaged app):**
- macOS: `~/Library/Application Support/Cookie Tracker/data/` (uses `productName`)
- Windows: `%APPDATA%/Cookie Tracker/data/`

**Development (`npm start`):**
- macOS: `~/Library/Application Support/cookie-tracker/data/` (uses `name`)
- Windows: `%APPDATA%/cookie-tracker/data/`

**Files Created:**
- `DC-YYYY-MM-DD-HH-MM-SS.xlsx` - Digital Cookie export
- `credentials.enc` - Encrypted credentials

## Complete API Flow

```javascript
// Step 1: Login
GET /login
  → Extract CSRF token from: <input name="_requestConfirmationToken" value="..." />

POST /j_spring_security_check
  Body: j_username={email}&j_password={pass}&_requestConfirmationToken={token}
  → Sets cookies: JSESSIONID, acceleratorSecureGUID

// Step 2: Select Role
GET /select-role
  → Parse HTML: <div class="custom-dropdown-option" data-value="2">Troop 1234...</div>
  → Extract IDs from role text: troopId=3990, serviceUnitId=695

GET /select-role?id=2
  → Activates selected role

// Step 3: Generate Report
GET /ajaxCall/generateReport?reportType=TROOP_ORDER_REPORT&troopId=3990&serviceUnitId=695&councilId=623
  → Response: {"errorCode":"0","responseData":"{\"fileName\":\"OrderDataTroop_...xlsx\"}"}

// Step 4: Download File
GET /ajaxCall/downloadFile/TROOP_ORDER_REPORT/OrderDataTroop_623_3990_02-01-2026_14.40.11.319.xlsx
  → Response: Excel file (binary)
```

## Configuration

In `credentials.json`:

```json
{
  "digitalCookie": {
    "username": "email@example.com",
    "password": "your-password",
    "role": "Troop 1234 of Service Unit 567",
    "councilId": "623"
  }
}
```

**Fields:**
- `username` - Email address
- `password` - Account password
- `role` - Exact role name from dropdown (must match exactly)
- `councilId` - Council ID (defaults to 623 if not specified)

## ID Extraction

The scraper automatically extracts:
- `troopId` from role name: "Troop **3990**" → 3990
- `serviceUnitId` from role name: "Service Unit **695**" → 695
- `councilId` from config (or uses default 623)

## Testing

```bash
# Start app
npm start

# 1. Configure credentials (include councilId if not 623)
# 2. Click "Sync from Websites"
# 3. Watch progress bar
# 4. File downloads to /data/in/DC-2026-02-01.xlsx
```

## Error Handling

All steps have error handling:
- Invalid credentials → Login fails, clear error message
- Role not found → Shows available roles in error
- Report generation fails → Shows API error message
- Download fails → Shows network error

Progress updates sent throughout:
- 10% - Getting CSRF token
- 20% - Logging in
- 25% - Selecting role
- 40% - Preparing export
- 50% - Generating report
- 60% - Downloading file
- 70% - Complete

## Status

**Digital Cookie: COMPLETE ✅**
- All endpoints working
- Fast API-based sync (no browser)
- Automatic ID extraction
- Robust error handling

**Next: Smart Cookie Integration**
