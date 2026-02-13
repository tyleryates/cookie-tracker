# Distributing Updates to Cookie Tracker

This guide explains how to distribute updates to users who have the Cookie Tracker app installed.

---

## Option 1: Manual Updates (Simplest)

### For You (Developer):
1. Make your code changes
2. Update version:
   ```bash
   make bump-patch      # 1.0.0 → 1.0.1
   # Or manually edit package.json
   ```
3. Build the app:
   ```bash
   make build           # macOS
   make build-win       # Windows
   make build-all       # Both
   ```
4. Find the installers in `release/` folder:
   - macOS: `Cookie Tracker-1.0.1-arm64.dmg` + `.zip`
   - Windows: `Cookie Tracker Setup 1.0.1.exe`
5. Share the file via email, Dropbox, Google Drive, etc.

**Quick Tip:** Run `make` to see all available commands!

### For Users:
1. Download the new installer
2. Run it (drag to Applications on Mac, run installer on Windows)
3. The new version replaces the old one

**Pros:** Simple, no setup required
**Cons:** Users must manually download and install

---

## Option 2: Auto-Updates via GitHub Releases (CONFIGURED)

This option has been set up in the code. Here's how to use it:

### Setup:

The GitHub publish config is already in `package.json` (owner: `tyleryates`, repo: `cookie-tracker`). You just need a GitHub token:

1. **Create a GitHub Personal Access Token** at https://github.com/settings/tokens (classic, `repo` scope)
2. **Set env var** (add to `~/.zshrc`):
   ```bash
   export GH_TOKEN="your_github_token_here"
   ```

### Publishing Updates:

**One-Command Release (Recommended):**
```bash
make release-patch    # Bump 1.0.0→1.0.1, commit, build, publish
make release-minor    # Bump 1.0.0→1.1.0, commit, build, publish
make release-major    # Bump 1.0.0→2.0.0, commit, build, publish
```

**Policy Note:** Do not run release or publish commands without explicit approval (see `CLAUDE.md`). These commands commit and publish.

This automatically:
- Bumps the version
- Commits the version change
- Builds the installers
- Publishes to GitHub Releases

**Or Manual Steps:**

1. **Make your changes** to the code

2. **Update version:**
   ```bash
   make bump-patch      # or bump-minor, bump-major
   ```

3. **Commit changes:**
   ```bash
   git add .
   git commit -m "Version 1.0.1: Fix packages sold calculation"
   git push
   ```

4. **Build and publish:**
   ```bash
   make publish
   ```

   This will:
   - Build the installers
   - Create a GitHub Release (v1.0.1)
   - Upload the installers to the release
   - Generate update metadata files

5. **Done!** Users will be notified automatically

### User Experience:

1. User opens the app (already has v1.0.0 installed)
2. App checks GitHub for updates (happens 3 seconds after launch)
3. If update found, download starts silently in the background
4. When download completes, user sees a non-blocking warning banner:
   ```
   Version 1.0.1 downloaded — restart to update
   ```
5. User can restart when convenient, or the update installs automatically on next quit
6. Next time app launches, it's on v1.0.1

### How It Works:

- `src/main.ts` checks GitHub Releases on startup (production only)
- Compares installed version vs latest release
- If newer version exists, downloads silently (`autoDownload: true`)
- Renderer shows a persistent warning banner when download completes
- Installs on quit (`autoInstallOnAppQuit: true`) or on manual restart

### Update Frequency:

- Checks for updates once per app launch
- Only in production (not during `npm start`)
- Doesn't slow down app startup (3-second delay)

---

## Option 3: Private Distribution (Without GitHub)

If you don't want to use GitHub public releases:

1. **Build locally:**
   ```bash
   make build-all
   ```

2. **Upload to private file host:**
   - Your own website
   - Dropbox/Google Drive with sharing link
   - Internal company server

3. **Share link with users** (manual download)

4. **Disable auto-update:** Comment out the `autoUpdater.checkForUpdates()` call in `src/main.ts`.

---

## Comparison

| Feature | Manual Updates | GitHub Auto-Update | Private Distribution |
|---------|----------------|-------------------|---------------------|
| Setup effort | None | Medium (one-time) | Low |
| User effort | High (manual) | Low (one click) | High (manual) |
| Distribution | Any method | GitHub Releases | Your choice |
| Privacy | Full control | Public releases* | Full control |
| Cost | Free | Free | Depends on host |

\* Can use private GitHub repos ($4/month for individuals)

---

## Troubleshooting

### Users not getting update notifications:

**Check:**
- Is app packaged? (`npm run build`, not `npm start`)
- Is GitHub token set? (`echo $GH_TOKEN`)
- Is publish config correct in package.json?
- Did the GitHub release get created? (Check the repo's Releases page on GitHub)

**Debug:**
```bash
# Check what electron-builder will upload
make test-build

# Manually create release
make publish
```

### Build fails with "publish" error:

**Likely causes:**
- GH_TOKEN not set or invalid
- Wrong owner/repo in package.json
- Token doesn't have `repo` scope

**Fix:**
```bash
# Test token
curl -H "Authorization: token $GH_TOKEN" https://api.github.com/user

# Should return your GitHub user info
```

### Mac users see "damaged" message:

**Cause:** App not code-signed or not notarized.

**Solution:** The app is now configured for automatic code signing and notarization. See the [Code Signing & Notarization](#code-signing--notarization-macos) section below. If you're distributing to a user before signing is set up, they can run:
```bash
xattr -cr "/Applications/Cookie Tracker.app"
```

---

## Code Signing & Notarization (macOS)

The build is configured to automatically sign, notarize, and package the app as a DMG. This eliminates the "damaged app" warning for users. If the signing environment variables are not set, the build still produces an unsigned app (safe for local dev).

### One-Time Setup

#### 1. Install a Developer ID Application certificate

1. Go to [developer.apple.com](https://developer.apple.com) > Account > Certificates, Identifiers & Profiles > Certificates
2. Click **+** and choose **Developer ID Application**
3. Follow the steps to create a Certificate Signing Request (CSR) via Keychain Access
4. Download the certificate and double-click to install it in Keychain

Verify it's installed:
```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

#### 2. Generate an app-specific password

1. Go to [appleid.apple.com](https://appleid.apple.com) > Sign-In and Security > App-Specific Passwords
2. Generate a password named `electron-notarize`
3. Copy the password (format: `xxxx-xxxx-xxxx-xxxx`)

#### 3. Find your Team ID

Go to [developer.apple.com](https://developer.apple.com) > Account > Membership details > Team ID (10-character string).

#### 4. Set environment variables

Add to `~/.zshrc`:
```bash
export APPLE_ID="your@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

Then reload: `source ~/.zshrc`

#### 5. Verify everything

```bash
make check-signing
```

### How It Works

- **Code signing**: electron-builder automatically finds the "Developer ID Application" certificate in Keychain
- **Hardened runtime**: Enabled with Electron-specific entitlements (JIT, unsigned memory, library validation bypass)
- **Notarization**: electron-builder submits the app to Apple and staples the notarization ticket
- **Output**: `release/` contains both a `.dmg` (drag-to-Applications installer) and `.zip` (for electron-updater auto-updates)

### Build Output

```bash
make build
# Produces in release/:
#   Cookie Tracker-{version}-arm64.dmg    — DMG installer
#   Cookie Tracker-{version}-arm64-mac.zip — zip for auto-updater
#   latest-mac.yml                         — auto-update metadata
```

### Verification

```bash
# Check the app is signed
codesign -dv --verbose=2 "release/mac-arm64/Cookie Tracker.app"

# Check Gatekeeper accepts it (after notarization)
spctl -a -t exec -vv "release/mac-arm64/Cookie Tracker.app"
```

---

## Recommended Approach

**For a small group (5-10 users):**
→ Use **Manual Updates** (simplest)

**For ongoing development with users wanting latest features:**
→ Use **GitHub Auto-Update** (best UX)

**For privacy-conscious or internal use:**
→ Use **Private Distribution** (full control)

---

## Installation Instructions to Send Users

### macOS:

1. Download `Cookie Tracker-{version}.dmg`
2. Double-click to open
3. Drag "Cookie Tracker" icon to Applications folder
4. Open Applications folder and double-click Cookie Tracker
5. If you see security warning: System Settings → Privacy & Security → "Open Anyway"

### Windows:

1. Download `Cookie Tracker Setup {version}.exe`
2. Double-click to run installer
3. Follow installation wizard
4. Launch from Start Menu or Desktop shortcut

---

## Version Numbering

Use [Semantic Versioning](https://semver.org/):

- **Major (1.0.0 → 2.0.0):** Breaking changes, major redesign
- **Minor (1.0.0 → 1.1.0):** New features, no breaking changes
- **Patch (1.0.0 → 1.0.1):** Bug fixes, small improvements

**Examples:**
- Fix packages sold bug → `1.0.1` (patch)
- Add new report → `1.1.0` (minor)
- Change data storage format → `2.0.0` (major)

---

## Release Checklist

Before publishing an update:

- [ ] Update version in `package.json`
- [ ] Test the new features/fixes
- [ ] Update README.md if needed
- [ ] Compile TypeScript: `make compile`
- [ ] Commit changes to git
- [ ] Build and test locally: `make build && open release/*.dmg`
- [ ] Verify app opens and works
- [ ] Publish: `make publish`
- [ ] Verify GitHub release was created
- [ ] (Optional) Notify users via email/Slack

---

## Support

Remember: This is a volunteer tool. Set expectations with users about update frequency and support availability.

**Suggested user communication:**
> "New version 1.0.1 is available! This fixes the packages sold calculation bug. If you have auto-updates enabled, you'll be notified when you open the app. Otherwise, download from [link]."
