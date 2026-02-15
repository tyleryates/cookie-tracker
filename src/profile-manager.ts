import * as fs from 'node:fs';
import * as path from 'node:path';
import Logger from './logger';
import type { ProfileInfo, ProfilesConfig } from './types';

const FILES_TO_MIGRATE = ['config.json', 'timestamps.json', 'sc-troop.json', 'sc-cookies.json', 'dc-roles.json', 'app.log'];
const DIRS_TO_MIGRATE = ['current', 'in'];

class ProfileManager {
  private rootDataDir: string;
  private profilesPath: string;

  constructor(rootDataDir: string) {
    this.rootDataDir = rootDataDir;
    this.profilesPath = path.join(rootDataDir, 'profiles.json');
  }

  /** One-time migration: move flat data/ files into data/default/ */
  migrate(): void {
    const defaultDir = path.join(this.rootDataDir, 'default');
    if (fs.existsSync(defaultDir)) return; // already migrated

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
        fs.renameSync(src, path.join(defaultDir, dir));
      }
    }

    const config: ProfilesConfig = {
      activeProfile: 'default',
      profiles: [{ name: 'default', dirName: 'default', createdAt: new Date().toISOString() }]
    };
    this.saveProfiles(config);
    Logger.info('ProfileManager: migration complete');
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

  isDefaultProfile(): boolean {
    const config = this.loadProfiles();
    return config.activeProfile === 'default';
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
    if (!existingDirs.has(slug)) return slug;

    let i = 2;
    while (existingDirs.has(`${slug}-${i}`)) i++;
    return `${slug}-${i}`;
  }
}

export default ProfileManager;
