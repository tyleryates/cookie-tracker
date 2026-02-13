import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeStorage } from 'electron';
import { DEFAULT_COUNCIL_ID } from './constants';
import Logger from './logger';
import type { Credentials } from './types';

class CredentialsManager {
  credentialsPath: string;

  constructor(dataDir: string | null = null) {
    // Use provided dataDir, or fall back to __dirname for development
    const baseDir = dataDir || path.join(__dirname, 'data');
    this.credentialsPath = path.join(baseDir, 'credentials.enc');
  }

  /**
   * Load credentials from encrypted file
   */
  loadCredentials(): Credentials {
    try {
      // Check if encryption is available first
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
          'Credential encryption is unavailable. Cannot safely load credentials. Please ensure your operating system keychain is accessible.'
        );
      }

      // Return empty credentials if encrypted file doesn't exist
      if (!fs.existsSync(this.credentialsPath)) {
        return {
          digitalCookie: { username: '', password: '', role: '', councilId: DEFAULT_COUNCIL_ID },
          smartCookie: { username: '', password: '' }
        };
      }

      const encryptedBuffer = fs.readFileSync(this.credentialsPath);
      const decryptedBuffer = safeStorage.decryptString(encryptedBuffer);
      const credentials = JSON.parse(decryptedBuffer);

      // Ensure optional fields have defaults
      if (credentials.digitalCookie) {
        credentials.digitalCookie.role ??= '';
        credentials.digitalCookie.councilId ??= DEFAULT_COUNCIL_ID;
      }

      return credentials;
    } catch (error) {
      Logger.error('Error loading credentials:', error);
      return {
        digitalCookie: { username: '', password: '', role: '', councilId: DEFAULT_COUNCIL_ID },
        smartCookie: { username: '', password: '' }
      };
    }
  }

  /**
   * Save credentials to encrypted file
   */
  saveCredentials(credentials: Credentials): { success: boolean; error?: string; path?: string; encrypted?: boolean } {
    try {
      // Create data directory if it doesn't exist
      const dataDir = path.dirname(this.credentialsPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Check if encryption is available
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
          'Credential encryption is unavailable. Cannot safely store credentials. Please ensure your operating system keychain is accessible.'
        );
      }

      const jsonString = JSON.stringify(credentials, null, 2);
      const encryptedBuffer = safeStorage.encryptString(jsonString);
      fs.writeFileSync(this.credentialsPath, encryptedBuffer);

      // Delete old plaintext file if it exists (migration)
      const oldPath = this.credentialsPath.replace('.enc', '.json');
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
        Logger.info('Migrated from plaintext to encrypted credentials');
      }

      return {
        success: true,
        path: this.credentialsPath,
        encrypted: true
      };
    } catch (error) {
      Logger.error('Error saving credentials:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Validate credentials object
   */
  validateCredentials(credentials: Credentials | null): { valid: boolean; error?: string } {
    if (!credentials) {
      return { valid: false, error: 'Credentials object is required' };
    }

    // Check Digital Cookie credentials
    if (!credentials.digitalCookie) {
      return { valid: false, error: 'Digital Cookie credentials are required' };
    }
    if (!credentials.digitalCookie.username || credentials.digitalCookie.username.trim() === '') {
      return { valid: false, error: 'Digital Cookie username is required' };
    }
    if (!credentials.digitalCookie.password || credentials.digitalCookie.password.trim() === '') {
      return { valid: false, error: 'Digital Cookie password is required' };
    }
    // Role is optional - will auto-select first "Troop" role if not provided

    // Check Smart Cookie credentials
    if (!credentials.smartCookie) {
      return { valid: false, error: 'Smart Cookie credentials are required' };
    }
    if (!credentials.smartCookie.username || credentials.smartCookie.username.trim() === '') {
      return { valid: false, error: 'Smart Cookie username is required' };
    }
    if (!credentials.smartCookie.password || credentials.smartCookie.password.trim() === '') {
      return { valid: false, error: 'Smart Cookie password is required' };
    }

    return { valid: true };
  }
}

export default CredentialsManager;
