import * as fs from 'node:fs';
import * as path from 'node:path';
import Logger from './logger';
import type { ProfileInfo, ProfilesConfig } from './types';

const FILES_TO_MIGRATE = ['config.json', 'timestamps.json', 'sc-troop.json', 'sc-cookies.json', 'dc-roles.json', 'app.log'];
const DIRS_TO_MIGRATE = ['current', 'in'];
const DIRS_TO_RENAME: Array<[string, string]> = [['current', 'sync']];
const RESERVED_DIR_NAMES = new Set(['default']);

class ProfileManager {
  private rootDataDir: string;
  private profilesPath: string;

  constructor(rootDataDir: string) {
    this.rootDataDir = rootDataDir;
    this.profilesPath = path.join(rootDataDir, 'profiles.json');
  }

  /** One-time migration: move flat data/ files into data/default/ */
  migrate(): void {
    // Use profiles.json (written last) as the completion marker — NOT data/default/.
    // If migration crashes after creating the dir but before finishing,
    // the next launch will re-run and move any remaining files.
    if (fs.existsSync(this.profilesPath)) return; // already migrated

    const defaultDir = path.join(this.rootDataDir, 'default');

    Logger.info('ProfileManager: migrating to profile-based layout');
    fs.mkdirSync(defaultDir, { recursive: true });

    for (const file of FILES_TO_MIGRATE) {
      const src = path.join(this.rootDataDir, file);
      if (fs.existsSync(src)) {
        fs.renameSync(src, path.join(defaultDir, file));
      }
    }

    for (const dir of DIRS_TO_MIGRATE) {
      const src = path.join(this.rootDataDir, dir);
      if (fs.existsSync(src)) {
        // Apply renames during initial migration (e.g. current → sync)
        const rename = DIRS_TO_RENAME.find(([from]) => from === dir);
        const destName = rename ? rename[1] : dir;
        fs.renameSync(src, path.join(defaultDir, destName));
      }
    }

    const config: ProfilesConfig = {
      activeProfile: 'default',
      profiles: [{ name: 'default', dirName: 'default', createdAt: new Date().toISOString() }]
    };
    this.saveProfiles(config);
    Logger.info('ProfileManager: migration complete');
  }

  /** Rename legacy subdirectories (e.g. current → sync) in all profile dirs */
  renameDirs(): void {
    if (DIRS_TO_RENAME.length === 0) return;
    const config = this.loadProfiles();
    for (const profile of config.profiles) {
      const profileDir = path.join(this.rootDataDir, profile.dirName);
      for (const [from, to] of DIRS_TO_RENAME) {
        const src = path.join(profileDir, from);
        const dest = path.join(profileDir, to);
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
          fs.renameSync(src, dest);
          Logger.info(`ProfileManager: renamed ${profile.dirName}/${from} → ${to}`);
        }
      }
    }
  }

  loadProfiles(): ProfilesConfig {
    const fallback: ProfilesConfig = {
      activeProfile: 'default',
      profiles: [{ name: 'default', dirName: 'default', createdAt: new Date().toISOString() }]
    };
    try {
      if (!fs.existsSync(this.profilesPath)) {
        this.saveProfiles(fallback);
        return fallback;
      }
      const raw = JSON.parse(fs.readFileSync(this.profilesPath, 'utf8'));
      if (typeof raw !== 'object' || raw === null || !Array.isArray(raw.profiles)) {
        this.saveProfiles(fallback);
        return fallback;
      }
      return raw as ProfilesConfig;
    } catch {
      this.saveProfiles(fallback);
      return fallback;
    }
  }

  saveProfiles(config: ProfilesConfig): void {
    if (!fs.existsSync(this.rootDataDir)) fs.mkdirSync(this.rootDataDir, { recursive: true });
    fs.writeFileSync(this.profilesPath, JSON.stringify(config, null, 2));
  }

  getActiveProfileDir(): string {
    const config = this.loadProfiles();
    return path.join(this.rootDataDir, config.activeProfile);
  }

  createProfile(name: string): { profile: ProfileInfo; config: ProfilesConfig } {
    const config = this.loadProfiles();
    const dirName = this.slugify(name, config.profiles);
    const profileDir = path.join(this.rootDataDir, dirName);
    fs.mkdirSync(profileDir, { recursive: true });

    const profile: ProfileInfo = { name, dirName, createdAt: new Date().toISOString() };
    config.profiles.push(profile);
    this.saveProfiles(config);
    return { profile, config };
  }

  deleteProfile(dirName: string): ProfilesConfig {
    if (dirName === 'default') throw new Error('Cannot delete the default profile');

    const config = this.loadProfiles();
    const profileDir = path.join(this.rootDataDir, dirName);
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }

    config.profiles = config.profiles.filter((p) => p.dirName !== dirName);
    if (config.activeProfile === dirName) {
      config.activeProfile = 'default';
    }
    this.saveProfiles(config);
    return config;
  }

  switchProfile(dirName: string): { profileDir: string; config: ProfilesConfig } {
    const config = this.loadProfiles();
    const profile = config.profiles.find((p) => p.dirName === dirName);
    if (!profile) throw new Error(`Profile not found: ${dirName}`);

    config.activeProfile = dirName;
    this.saveProfiles(config);
    return { profileDir: path.join(this.rootDataDir, dirName), config };
  }

  private slugify(name: string, existing: ProfileInfo[]): string {
    let slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!slug) slug = 'profile';

    const existingDirs = new Set(existing.map((p) => p.dirName));
    if (!existingDirs.has(slug) && !RESERVED_DIR_NAMES.has(slug)) return slug;

    let i = 2;
    while (existingDirs.has(`${slug}-${i}`)) i++;
    return `${slug}-${i}`;
  }
}

export default ProfileManager;
