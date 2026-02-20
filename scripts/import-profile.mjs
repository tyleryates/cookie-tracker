#!/usr/bin/env node

// import-profile.mjs — Import a .zip export as a named profile for local debugging.
//
// Usage: node scripts/import-profile.mjs <zip-file> [profile-name]
//   profile-name defaults to the zip filename without extension.
//
// This creates a new profile in the app's data directory and extracts
// the zip contents into it. The profile will appear in the app's profile
// switcher the next time it launches.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import { ROOT_DATA_DIR, loadProfiles, saveProfiles, slugify } from './profile-helpers.mjs';

const ALLOWED_EXTENSIONS = new Set(['.json', '.csv', '.xlsx', '.xls', '.html']);

// --- Main ---

const zipPath = process.argv[2];
if (!zipPath) {
  console.error('Usage: node scripts/import-profile.mjs <zip-file> [profile-name]');
  process.exit(1);
}

const resolvedZip = path.resolve(zipPath);
if (!fs.existsSync(resolvedZip)) {
  console.error(`File not found: ${resolvedZip}`);
  process.exit(1);
}

const profileName = process.argv[3] || path.basename(zipPath, path.extname(zipPath));
const config = loadProfiles();

if (config.profiles.some(p => p.name === profileName)) {
  console.error(`Profile "${profileName}" already exists. Choose a different name.`);
  process.exit(1);
}

const dirName = slugify(profileName, config.profiles);
const profileDir = path.join(ROOT_DATA_DIR, dirName);

// Extract to temp dir, validate, then move
const tempDir = path.join(ROOT_DATA_DIR, `_import_${crypto.randomBytes(8).toString('hex')}`);
fs.mkdirSync(tempDir, { recursive: true });
fs.mkdirSync(profileDir, { recursive: true });

try {
  execFileSync('ditto', ['-xk', resolvedZip, tempDir], { timeout: 30000 });

  // Remove credentials if included (security)
  const credFile = path.join(tempDir, 'credentials.enc');
  if (fs.existsSync(credFile)) fs.unlinkSync(credFile);

  // Move allowed files to profile dir
  for (const entry of fs.readdirSync(tempDir)) {
    const entryPath = path.join(tempDir, entry);
    const stat = fs.lstatSync(entryPath);
    if (stat.isSymbolicLink()) {
      console.warn(`Skipping symlink: ${entry}`);
      continue;
    }
    if (stat.isDirectory()) {
      fs.renameSync(entryPath, path.join(profileDir, entry));
      continue;
    }
    const ext = path.extname(entry).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      console.warn(`Skipping unrecognized file type: ${entry}`);
      continue;
    }
    fs.renameSync(entryPath, path.join(profileDir, entry));
  }

  // Register the profile
  config.profiles.push({ name: profileName, dirName, createdAt: new Date().toISOString() });
  saveProfiles(config);

  console.log(`Imported "${profileName}" as profile "${dirName}"`);
  console.log(`Profile directory: ${profileDir}`);
  console.log('Launch the app to switch to this profile.');
} finally {
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
}
