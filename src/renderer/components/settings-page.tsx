// SettingsPage — Full page for credential management with verification

import { useEffect, useState } from 'preact/hooks';
import Logger from '../../logger';
import type { DCRole } from '../../seasonal-data';
import type { AppConfig, CredentialPatch } from '../../types';
import { ipcInvoke, ipcInvokeRaw } from '../ipc';

interface SCVerifyResult {
  troopName: string | null;
  cookieCount: number;
}

interface SettingsPageProps {
  mode: 'welcome' | 'settings';
  appConfig: AppConfig | null;
  autoSyncEnabled: boolean;
  autoRefreshBoothsEnabled: boolean;
  onBack: () => void;
  onUpdateConfig: (patch: Partial<AppConfig>) => void;
  onToggleAutoSync: (enabled: boolean) => void;
  onToggleAutoRefreshBooths: (enabled: boolean) => void;
}

export function SettingsPage({
  mode,
  appConfig,
  autoSyncEnabled,
  autoRefreshBoothsEnabled,
  onBack,
  onUpdateConfig,
  onToggleAutoSync,
  onToggleAutoRefreshBooths
}: SettingsPageProps) {
  // Smart Cookie fields
  const [scUsername, setScUsername] = useState('');
  const [scPassword, setScPassword] = useState('');
  const [scVerifying, setScVerifying] = useState(false);
  const [scVerified, setScVerified] = useState<SCVerifyResult | null>(null);
  const [scError, setScError] = useState<string | null>(null);

  // Digital Cookie fields
  const [dcUsername, setDcUsername] = useState('');
  const [dcPassword, setDcPassword] = useState('');
  const [dcVerifying, setDcVerifying] = useState(false);
  const [dcRoles, setDcRoles] = useState<DCRole[]>([]);
  const [dcSelectedRole, setDcSelectedRole] = useState('');
  const [dcConfirmed, setDcConfirmed] = useState(false);
  const [dcError, setDcError] = useState<string | null>(null);

  // Load existing credentials + seasonal data on mount
  useEffect(() => {
    (async () => {
      try {
        const [creds, seasonal] = await Promise.all([ipcInvoke('load-credentials'), ipcInvoke('load-seasonal-data')]);

        setScUsername(creds.smartCookie.username || '');
        setDcUsername(creds.digitalCookie.username || '');

        // Restore SC verification status only if full credentials (including password) are present
        if (seasonal.troop && creds.smartCookie.username && creds.smartCookie.hasPassword) {
          setScVerified({
            troopName: seasonal.troop.role?.troop_name || null,
            cookieCount: seasonal.cookies?.length || 0
          });
        }

        // Restore DC roles only if full credentials (including password) are present
        if (seasonal.dcRoles && seasonal.dcRoles.length > 0 && creds.digitalCookie.username && creds.digitalCookie.hasPassword) {
          setDcRoles(seasonal.dcRoles);
          setDcConfirmed(true);

          // Pre-select saved role, or auto-select first Troop role
          if (creds.digitalCookie.role) {
            setDcSelectedRole(creds.digitalCookie.role);
          } else {
            const troopRole = seasonal.dcRoles.find((r) => r.name.startsWith('Troop'));
            if (troopRole) setDcSelectedRole(troopRole.name);
          }
        }
      } catch (error) {
        Logger.error('Error loading settings:', error);
      }
    })();
  }, []);

  const saveCredentials = async (patch: CredentialPatch) => {
    return ipcInvokeRaw('save-credentials', patch);
  };

  const handleVerifySC = async () => {
    if (!scUsername.trim() || !scPassword.trim()) {
      setScError('Email and password are required');
      return;
    }

    setScVerifying(true);
    setScError(null);
    setScVerified(null);

    try {
      const result = await ipcInvoke('verify-sc', {
        username: scUsername.trim(),
        password: scPassword.trim()
      });

      setScVerified({
        troopName: result.troop.role?.troop_name || null,
        cookieCount: result.cookies?.length || 0
      });

      // Persist seasonal data + credentials (saveCredentials updates the ref)
      await Promise.all([
        ipcInvoke('save-seasonal-data', { troop: result.troop, cookies: result.cookies }),
        saveCredentials({ smartCookie: { username: scUsername.trim(), password: scPassword.trim() } })
      ]);
      // Clear password from state now that it's saved to keychain
      setScPassword('');
      if (mode === 'welcome' && dcConfirmed) onBack();
    } catch (error) {
      setScError((error as Error).message);
    } finally {
      setScVerifying(false);
    }
  };

  const handleVerifyDC = async () => {
    if (!dcUsername.trim() || !dcPassword.trim()) {
      setDcError('Email and password are required');
      return;
    }

    setDcVerifying(true);
    setDcError(null);
    setDcRoles([]);

    try {
      const result = await ipcInvoke('verify-dc', {
        username: dcUsername.trim(),
        password: dcPassword.trim()
      });

      setDcRoles(result.roles);

      // Auto-select first Troop role
      const troopRole = result.roles.find((r) => r.name.startsWith('Troop'));
      let selectedRole = '';
      if (troopRole) {
        selectedRole = troopRole.name;
      } else if (result.roles.length > 0) {
        selectedRole = result.roles[0].name;
      }
      setDcSelectedRole(selectedRole);

      // Persist DC roles + credentials (saveCredentials updates the ref)
      await Promise.all([
        ipcInvoke('save-seasonal-data', { dcRoles: result.roles }),
        saveCredentials({
          digitalCookie: { username: dcUsername.trim(), password: dcPassword.trim(), role: selectedRole || undefined }
        })
      ]);
      // Clear password from state now that it's saved to keychain
      setDcPassword('');
    } catch (error) {
      setDcError((error as Error).message);
    } finally {
      setDcVerifying(false);
    }
  };

  const handleConfirmDC = async () => {
    if (!dcSelectedRole) return;
    await saveCredentials({ digitalCookie: { role: dcSelectedRole } });
    setDcConfirmed(true);
    if (mode === 'welcome' && scVerified) onBack();
  };

  const handleClearSC = async () => {
    setScUsername('');
    setScPassword('');
    setScVerified(null);
    setScError(null);
    await Promise.all([
      ipcInvoke('save-seasonal-data', { troop: null, cookies: null }),
      saveCredentials({ smartCookie: { username: '', password: '' } })
    ]);
  };

  const handleClearDC = async () => {
    setDcUsername('');
    setDcPassword('');
    setDcRoles([]);
    setDcSelectedRole('');
    setDcConfirmed(false);
    setDcError(null);
    await Promise.all([
      ipcInvoke('save-seasonal-data', { dcRoles: null }),
      saveCredentials({ digitalCookie: { username: '', password: '' } })
    ]);
  };

  return (
    <div class="settings-page">
      <h2>{mode === 'welcome' ? 'Welcome' : 'Settings'}</h2>
      {mode === 'welcome' && (
        <p class="settings-welcome-message">
          One-time setup — enter your Smart Cookie and Digital Cookie logins below. Credentials are encrypted on disk using your OS
          keychain.
        </p>
      )}
      {mode === 'settings' && (
        <div class="settings-toggles">
          <label class="toggle-switch">
            <input type="checkbox" checked={autoSyncEnabled} onChange={(e) => onToggleAutoSync((e.target as HTMLInputElement).checked)} />
            <span class="toggle-slider" />
            <span class="toggle-label">Auto Sync Reports</span>
          </label>
          {appConfig?.availableBoothsEnabled && (
            <label class="toggle-switch">
              <input
                type="checkbox"
                checked={autoRefreshBoothsEnabled}
                onChange={(e) => onToggleAutoRefreshBooths((e.target as HTMLInputElement).checked)}
              />
              <span class="toggle-slider" />
              <span class="toggle-label">Auto Refresh Booths</span>
            </label>
          )}
          <label class="toggle-switch">
            <input
              type="checkbox"
              checked={appConfig?.availableBoothsEnabled ?? false}
              onChange={(e) => onUpdateConfig({ availableBoothsEnabled: (e.target as HTMLInputElement).checked })}
            />
            <span class="toggle-slider" />
            <span class="toggle-label">Booth Finder</span>
          </label>
        </div>
      )}
      <div class="settings-cards">
        {/* Smart Cookie Section */}
        <div class="settings-card">
          <h3>Smart Cookie</h3>
          <form
            class="settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!scVerifying && !scVerified) handleVerifySC();
            }}
          >
            <div class="form-group">
              <label for="scUsername">Email:</label>
              <input
                type="text"
                id="scUsername"
                class="form-input"
                placeholder="Enter email"
                value={scUsername}
                disabled={!!scVerified}
                onInput={(e) => setScUsername((e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="form-group">
              <label for="scPassword">Password:</label>
              <input
                type="password"
                id="scPassword"
                class="form-input"
                placeholder="Enter password"
                value={scVerified ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : scPassword}
                disabled={!!scVerified}
                onInput={(e) => setScPassword((e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="settings-verify-row">
              <button type="submit" class="btn btn-secondary" disabled={scVerifying || !!scVerified}>
                {scVerified ? 'Verified' : scVerifying ? 'Verifying...' : 'Verify'}
              </button>
              {scVerified && (
                <button type="button" class="btn btn-secondary" onClick={handleClearSC}>
                  Clear
                </button>
              )}
              {scError && <span class="settings-error">{scError}</span>}
            </div>
            {scVerified && (
              <div class="settings-status-indicators">
                {scVerified.troopName && (
                  <span class="settings-status-ok">
                    {'\u2713'} Troop {scVerified.troopName}
                  </span>
                )}
                {scVerified.cookieCount > 0 && (
                  <span class="settings-status-ok">
                    {'\u2713'} {scVerified.cookieCount} cookie types
                  </span>
                )}
              </div>
            )}
          </form>
        </div>

        {/* Digital Cookie Section */}
        <div class="settings-card">
          <h3>Digital Cookie</h3>
          <form
            class="settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (dcRoles.length > 0 && !dcConfirmed) handleConfirmDC();
              else if (!dcVerifying && dcRoles.length === 0) handleVerifyDC();
            }}
          >
            <div class="form-group">
              <label for="dcUsername">Email:</label>
              <input
                type="text"
                id="dcUsername"
                class="form-input"
                placeholder="Enter email"
                value={dcUsername}
                disabled={dcRoles.length > 0}
                onInput={(e) => setDcUsername((e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="form-group">
              <label for="dcPassword">Password:</label>
              <input
                type="password"
                id="dcPassword"
                class="form-input"
                placeholder="Enter password"
                value={dcRoles.length > 0 ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : dcPassword}
                disabled={dcRoles.length > 0}
                onInput={(e) => setDcPassword((e.target as HTMLInputElement).value)}
              />
            </div>
            {dcRoles.length > 0 && (
              <div class="form-group">
                <label for="dcRoleSelect">Role:</label>
                <select
                  id="dcRoleSelect"
                  class="form-input"
                  value={dcSelectedRole}
                  disabled={dcConfirmed}
                  onChange={(e) => setDcSelectedRole((e.target as HTMLSelectElement).value)}
                >
                  {dcRoles.map((role) => (
                    <option key={role.id} value={role.name}>
                      {role.name}
                    </option>
                  ))}
                </select>
                {!dcConfirmed && <span class="settings-role-hint">Select the role associated with this troop</span>}
              </div>
            )}
            <div class="settings-verify-row">
              <button type="submit" class="btn btn-secondary" disabled={dcVerifying || dcConfirmed}>
                {dcConfirmed ? 'Verified' : dcRoles.length > 0 ? 'Confirm' : dcVerifying ? 'Verifying...' : 'Verify'}
              </button>
              {dcRoles.length > 0 && (
                <button type="button" class="btn btn-secondary" onClick={handleClearDC}>
                  Clear
                </button>
              )}
              {dcError && <span class="settings-error">{dcError}</span>}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
