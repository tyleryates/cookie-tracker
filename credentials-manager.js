const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');
const { DEFAULT_COUNCIL_ID } = require('./constants');
const Logger = require('./logger');

class CredentialsManager {
  constructor(dataDir = null) {
    // Use provided dataDir, or fall back to __dirname for development
    const baseDir = dataDir || path.join(__dirname, 'data');
    this.credentialsPath = path.join(baseDir, 'credentials.enc');
  }

  /**
   * Load credentials from encrypted file
   * @returns {Object} Credentials object with digitalCookie and smartCookie properties
   */
  loadCredentials() {
    try {
      // Check if encryption is available first
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Credential encryption is unavailable. Cannot safely load credentials. Please ensure your operating system keychain is accessible.');
      }

      // Return empty credentials if encrypted file doesn't exist
      if (!fs.existsSync(this.credentialsPath)) {
        return {
          digitalCookie: { username: '', password: '', role: '', councilId: DEFAULT_COUNCIL_ID },
          smartCookie: { username: '', password: '' }
        };
      }

      // Read encrypted buffer
      const encryptedBuffer = fs.readFileSync(this.credentialsPath);

      // Decrypt using OS keychain
      const decryptedBuffer = safeStorage.decryptString(encryptedBuffer);
      const credentials = JSON.parse(decryptedBuffer);

      // Ensure fields exist (backward compatibility)
      if (credentials.digitalCookie) {
        if (!credentials.digitalCookie.hasOwnProperty('role')) {
          credentials.digitalCookie.role = '';
        }
        if (!credentials.digitalCookie.hasOwnProperty('councilId')) {
          credentials.digitalCookie.councilId = DEFAULT_COUNCIL_ID; // Default
        }
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
   * @param {Object} credentials - Credentials object
   * @returns {Object} Result with success status
   */
  saveCredentials(credentials) {
    try {
      // Validate credentials structure
      const validation = this.validateCredentials(credentials);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }

      // Create data directory if it doesn't exist
      const dataDir = path.dirname(this.credentialsPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Check if encryption is available
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Credential encryption is unavailable. Cannot safely store credentials. Please ensure your operating system keychain is accessible.');
      }

      // Convert credentials to JSON string
      const jsonString = JSON.stringify(credentials, null, 2);

      // Encrypt using OS keychain
      const encryptedBuffer = safeStorage.encryptString(jsonString);

      // Write encrypted buffer to file
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
        error: error.message
      };
    }
  }

  /**
   * Validate credentials object
   * @param {Object} credentials - Credentials to validate
   * @returns {Object} Validation result
   */
  validateCredentials(credentials) {
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

module.exports = CredentialsManager;
