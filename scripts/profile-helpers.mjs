// profile-helpers.mjs — Shared profile management helpers for dev scripts.

import * as fs from 'node:fs';
import * as path from 'node:path';

export const ROOT_DATA_DIR = path.join(process.env.HOME, 'Library', 'Application Support', 'cookie-tracker', 'data');
const profilesPath = path.join(ROOT_DATA_DIR, 'profiles.json');

export function loadProfiles() {
  const fallback = {
    activeProfile: 'default',
    profiles: [{ name: 'default', dirName: 'default', createdAt: new Date().toISOString() }]
  };
  try {
    if (!fs.existsSync(profilesPath)) return fallback;
    const raw = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
    if (!raw || !Array.isArray(raw.profiles)) return fallback;
    return raw;
  } catch {
    return fallback;
  }
}

export function saveProfiles(config) {
  fs.mkdirSync(ROOT_DATA_DIR, { recursive: true });
  fs.writeFileSync(profilesPath, JSON.stringify(config, null, 2));
}

export function slugify(name, existing) {
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) slug = 'profile';
  const existingDirs = new Set(existing.map(p => p.dirName));
  if (!existingDirs.has(slug) && slug !== 'default') return slug;
  let i = 2;
  while (existingDirs.has(`${slug}-${i}`)) i++;
  return `${slug}-${i}`;
}

/**
 * Ensure a profile exists with the given name.
 * If `copyFrom` is provided, copies that profile's data into the new one.
 * If the profile already exists, deletes and recreates it.
 * Sets the profile as active and disables auto-sync.
 * Returns the profile's data directory path.
 */
export function ensureProfile(name, { copyFrom } = {}) {
  const config = loadProfiles();

  // Delete existing profile with this name (if any)
  const existing = config.profiles.find(p => p.name === name);
  if (existing) {
    const dir = path.join(ROOT_DATA_DIR, existing.dirName);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    config.profiles = config.profiles.filter(p => p.name !== name);
  }

  const dirName = slugify(name, config.profiles);
  const profileDir = path.join(ROOT_DATA_DIR, dirName);
  fs.mkdirSync(profileDir, { recursive: true });

  // Copy source profile data if requested
  if (copyFrom) {
    const sourceDir = path.join(ROOT_DATA_DIR, copyFrom);
    if (!fs.existsSync(sourceDir)) {
      console.error(`Source profile directory not found: ${sourceDir}`);
      process.exit(1);
    }
    for (const entry of fs.readdirSync(sourceDir)) {
      const src = path.join(sourceDir, entry);
      const dest = path.join(profileDir, entry);
      const stat = fs.lstatSync(src);
      if (stat.isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
      } else if (stat.isFile()) {
        fs.copyFileSync(src, dest);
      }
    }
  } else {
    // Always copy credentials and seasonal data from default so the app
    // doesn't show the welcome page on dev profiles
    const defaultDir = path.join(ROOT_DATA_DIR, 'default');
    const identityFiles = ['credentials.enc', 'sc-troop.json', 'sc-cookies.json', 'dc-roles.json'];
    for (const file of identityFiles) {
      const src = path.join(defaultDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(profileDir, file));
      }
    }
  }

  // Register profile and set as active
  config.profiles.push({ name, dirName, createdAt: new Date().toISOString() });
  config.activeProfile = dirName;
  saveProfiles(config);

  // Disable auto-sync so the app doesn't overwrite test data
  const configPath = path.join(profileDir, 'config.json');
  let appConfig = {};
  if (fs.existsSync(configPath)) {
    appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  appConfig.autoSync = false;
  if (appConfig.boothFinder) appConfig.boothFinder.autoRefresh = false;
  fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');

  return profileDir;
}
