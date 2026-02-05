# Security Policy

## Reporting Security Issues

If you discover a security vulnerability in Cookie Tracker, please email the maintainer directly rather than opening a public issue.

## Known Vulnerabilities

### xlsx Package (Dependency)

**Package:** `xlsx@0.18.5`

**Known Issues:**
1. **Prototype Pollution** (High) - [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)
2. **Regular Expression Denial of Service** (High) - [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)

**Risk Assessment:**
- These vulnerabilities require malicious Excel files to be processed
- Cookie Tracker only processes Excel files from trusted sources (Smart Cookie exports)
- Files are never uploaded from external/untrusted sources
- Risk is **LOW** for the intended use case

**Mitigation:**
- Only import Excel files exported directly from Smart Cookie
- Never import Excel files from untrusted sources
- Monitor for xlsx package updates

**Status:** Accepted risk - No alternative Excel parsing library with better security profile available

---

## Security Best Practices

### Credential Storage

- Credentials are encrypted using OS-native keychains:
  - macOS: Keychain Access
  - Windows: Credential Manager
- Never stored in plain text
- Encryption handled by Electron's `safeStorage` API

### Data Storage

- All data stored locally in:
  - macOS: `~/Library/Application Support/Cookie Tracker/`
  - Windows: `%APPDATA%/Cookie Tracker/`
- No data sent to external servers
- No analytics or tracking

### Network Security

- HTTPS only for all API calls
- CSRF protection implemented for Smart Cookie API
- Cookie jar properly managed to prevent session leakage

### Code Security

- HTML escaping for all user-displayable content (XSS prevention)
- No `eval()` or dynamic code execution
- No command injection vectors

---

## Privacy

### Data Collection

Cookie Tracker does **NOT** collect or transmit:
- Personal information
- Troop data
- Scout information
- Financial data
- Usage analytics

### Data Sharing

All data remains **local** to your computer. The app only communicates with:
1. Digital Cookie website (to download your data)
2. Smart Cookie API (to download your data)
3. GitHub Releases (optional - for auto-updates only)

---

## Auto-Update Security

If you enable auto-updates via GitHub:
- Updates are downloaded over HTTPS
- Code signing recommended (requires Apple Developer account - $99/year)
- Users can verify updates by checking GitHub releases

---

## Audit History

- **2026-02-04** - Initial security review before v1.0.0 release
  - No critical vulnerabilities found in application code
  - xlsx dependency vulnerability documented and risk accepted
  - Sensitive console.log statements removed
  - Hardcoded troop-specific data removed

---

## Responsible Disclosure

We take security seriously. If you discover a security issue:

1. **DO NOT** open a public GitHub issue
2. Email the maintainer with details
3. Allow reasonable time for a fix before public disclosure
4. We will credit you in the security advisory (if desired)

---

**Last Updated:** 2026-02-04
