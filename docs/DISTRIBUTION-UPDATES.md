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
4. Find the installers in `dist/` folder:
   - macOS: `Cookie Tracker-1.0.1.dmg`
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

### Initial Setup (One Time):

1. **Create a GitHub repository:**
   ```bash
   cd /path/to/cookie-tracker
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Create repo on GitHub** and push:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/cookie-tracker.git
   git push -u origin main
   ```

3. **Add publish configuration to package.json:**

   Open `package.json` and add this inside the `"build"` section:
   ```json
   "publish": {
     "provider": "github",
     "owner": "your-github-username",
     "repo": "cookie-tracker"
   },
   ```

   Replace `your-github-username` with your actual GitHub username.

4. **Create GitHub Personal Access Token:**
   - Go to: https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Select scope: `repo` (full control)
   - Copy the token

5. **Set environment variable** (add to `~/.zshrc` or `~/.bash_profile`):
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
3. If update found, user sees dialog:
   ```
   A new version (1.0.1) is available!

   Would you like to download it now? The app will
   install the update when you restart.
   ```
4. User clicks OK → Download happens in background
5. When download completes, user sees:
   ```
   Update downloaded successfully!

   Click OK to restart the app and install the update now,
   or Cancel to install on next restart.
   ```
6. User chooses to restart now or later
7. Next time app launches, it's on v1.0.1 ✓

### How It Works:

- `src/main.ts` checks GitHub Releases on startup
- Compares installed version vs latest release
- If newer version exists, prompts user
- Downloads update in background
- Installs on restart (macOS) or immediately (Windows)

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
- Did the GitHub release get created? (Check: https://github.com/YOUR_USERNAME/cookie-tracker/releases)

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

**Cause:** App not code-signed

**Solution:**
```bash
# User workaround (one-time):
xattr -cr "/Applications/Cookie Tracker.app"
```

Or get an Apple Developer account ($99/year) for code signing.

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
- [ ] Build and test locally: `make build && open dist/*.dmg`
- [ ] Verify app opens and works
- [ ] Publish: `make publish`
- [ ] Verify GitHub release was created
- [ ] (Optional) Notify users via email/Slack

---

## Support

Remember: This is a volunteer tool. Set expectations with users about update frequency and support availability.

**Suggested user communication:**
> "New version 1.0.1 is available! This fixes the packages sold calculation bug. If you have auto-updates enabled, you'll be notified when you open the app. Otherwise, download from [link]."
