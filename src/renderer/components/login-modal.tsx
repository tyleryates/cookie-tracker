// LoginModal — Controlled form for configuring DC and SC credentials

import { ipcRenderer } from 'electron';
import { useEffect, useState } from 'preact/hooks';
import Logger from '../../logger';
import type { Credentials } from '../../types';

interface LoginModalProps {
  onClose: () => void;
  onSave: (credentials: Credentials) => void;
  showStatus: (msg: string, type: 'success' | 'warning' | 'error') => void;
}

function CredentialFields({
  title,
  prefix,
  username,
  password,
  onUsername,
  onPassword,
  children
}: {
  title: string;
  prefix: string;
  username: string;
  password: string;
  onUsername: (v: string) => void;
  onPassword: (v: string) => void;
  children?: preact.ComponentChildren;
}) {
  return (
    <div class="credentials-section">
      <h3>{title}</h3>
      <div class="form-group">
        <label for={`${prefix}Username`}>Username:</label>
        <input
          type="text"
          id={`${prefix}Username`}
          class="form-input"
          placeholder="Enter username"
          value={username}
          onInput={(e) => onUsername((e.target as HTMLInputElement).value)}
        />
      </div>
      <div class="form-group">
        <label for={`${prefix}Password`}>Password:</label>
        <input
          type="password"
          id={`${prefix}Password`}
          class="form-input"
          placeholder="Enter password"
          value={password}
          onInput={(e) => onPassword((e.target as HTMLInputElement).value)}
        />
      </div>
      {children}
    </div>
  );
}

export function LoginModal({ onClose, onSave, showStatus }: LoginModalProps) {
  const [dcUsername, setDcUsername] = useState('');
  const [dcPassword, setDcPassword] = useState('');
  const [dcRole, setDcRole] = useState('');
  const [scUsername, setScUsername] = useState('');
  const [scPassword, setScPassword] = useState('');

  // Load existing credentials on mount
  useEffect(() => {
    (async () => {
      try {
        const result = await ipcRenderer.invoke('load-credentials');
        if (result.success && result.data) {
          setDcUsername(result.data.digitalCookie.username || '');
          setDcPassword(result.data.digitalCookie.password || '');
          setDcRole(result.data.digitalCookie.role || '');
          setScUsername(result.data.smartCookie.username || '');
          setScPassword(result.data.smartCookie.password || '');
        }
      } catch (error) {
        Logger.error('Error loading credentials:', error);
      }
    })();
  }, []);

  const handleSave = async () => {
    try {
      const credentials: Credentials = {
        digitalCookie: { username: dcUsername.trim(), password: dcPassword.trim(), role: dcRole.trim() },
        smartCookie: { username: scUsername.trim(), password: scPassword.trim() }
      };

      const result = await ipcRenderer.invoke('save-credentials', credentials);

      // Best-effort memory clearing (JS strings are immutable; real security is OS keychain)
      credentials.digitalCookie.password = '';
      credentials.smartCookie.password = '';
      setDcPassword('');
      setScPassword('');

      if (result.success) {
        showStatus('Credentials saved successfully', 'success');
        onSave(credentials);
      } else {
        showStatus(`Error saving credentials: ${result.error}`, 'error');
      }
    } catch (error) {
      showStatus(`Error: ${(error as Error).message}`, 'error');
    }
  };

  const handleBackdropClick = (e: Event) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      class="modal show"
      role="dialog"
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div class="modal-content">
        <div class="modal-header">
          <h2>Configure Website Logins</h2>
          <button type="button" class="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div class="modal-body">
          <CredentialFields
            title="Digital Cookie"
            prefix="dc"
            username={dcUsername}
            password={dcPassword}
            onUsername={setDcUsername}
            onPassword={setDcPassword}
          >
            <div class="form-group">
              <label for="dcRole">Role (optional):</label>
              <input
                type="text"
                id="dcRole"
                class="form-input"
                placeholder="Leave empty to auto-select first Troop role"
                value={dcRole}
                onInput={(e) => setDcRole((e.target as HTMLInputElement).value)}
              />
              <small class="form-hint">Leave blank to auto-select, or enter exact role name (e.g., "Troop 1234 of Service Unit 567")</small>
            </div>
          </CredentialFields>

          <CredentialFields
            title="Smart Cookie"
            prefix="sc"
            username={scUsername}
            password={scPassword}
            onUsername={setScUsername}
            onPassword={setScPassword}
          />

          <p class="modal-note">{'🔒 Credentials are encrypted using your OS keychain (macOS Keychain, Windows Credential Manager).'}</p>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" class="btn btn-primary" onClick={handleSave}>
            Save Credentials
          </button>
        </div>
      </div>
    </div>
  );
}
