// SettingsPage — Credential management with verification

import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import Logger, { getErrorMessage } from '../../logger';
import type { DCRole } from '../../seasonal-data';
import type { CredentialPatch } from '../../types';
import { ipcInvoke, ipcInvokeRaw } from '../ipc';

interface SCVerifyResult {
  troopName: string | null;
  cookieCount: number;
}

interface SettingsPageProps {
  mode: 'welcome' | 'settings';
  onComplete?: () => void;
}

interface CredentialFormProps {
  label: string;
  idPrefix: string;
  username: string;
  password: string;
  onUpdateUsername: (value: string) => void;
  onUpdatePassword: (value: string) => void;
  onSubmit: () => void;
  verifying: boolean;
  verified: boolean;
  confirmed: boolean;
  disabled: boolean;
  buttonLabel: string;
  error: string | null;
  onClear: () => void;
  extraFields?: ComponentChildren;
  statusIndicators?: ComponentChildren;
}

function CredentialForm({
  label,
  idPrefix,
  username,
  password,
  onUpdateUsername,
  onUpdatePassword,
  onSubmit,
  verifying,
  verified,
  confirmed,
  disabled,
  buttonLabel,
  error,
  onClear,
  extraFields,
  statusIndicators
}: CredentialFormProps) {
  return (
    <div class={`settings-card ${confirmed ? 'settings-card-done' : ''}`}>
      <h3>
        {label}
        {confirmed && <span class="settings-card-check">{'\u2713'}</span>}
      </h3>
      <form
        class="settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div class="form-group">
          <label for={`${idPrefix}Username`}>Email:</label>
          <input
            type="text"
            id={`${idPrefix}Username`}
            class="form-input"
            placeholder="Enter email"
            value={username}
            disabled={disabled}
            onInput={(e) => onUpdateUsername((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="form-group">
          <label for={`${idPrefix}Password`}>Password:</label>
          <input
            type="password"
            id={`${idPrefix}Password`}
            class="form-input"
            placeholder="Enter password"
            value={disabled ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : password}
            disabled={disabled}
            onInput={(e) => onUpdatePassword((e.target as HTMLInputElement).value)}
          />
        </div>
        {extraFields}
        <div class="settings-verify-row">
          <button type="submit" class="btn btn-primary" disabled={verifying || confirmed}>
            {buttonLabel}
          </button>
          {verified && (
            <button type="button" class="btn btn-secondary" onClick={onClear}>
              Clear
            </button>
          )}
          {error && <span class="settings-error">{error}</span>}
        </div>
        {statusIndicators}
      </form>
    </div>
  );
}

// ============================================================================
// CREDENTIAL FORM HOOKS
// ============================================================================

function saveCredentials(patch: CredentialPatch) {
  return ipcInvokeRaw('save-credentials', patch);
}

function useSCForm() {
  const [sc, setSc] = useState({
    username: '',
    password: '',
    verifying: false,
    verified: null as SCVerifyResult | null,
    error: null as string | null
  });
  const updateSc = (patch: Partial<typeof sc>) => setSc((prev) => ({ ...prev, ...patch }));

  // Load existing SC credentials + seasonal data on mount
  useEffect(() => {
    (async () => {
      try {
        const [creds, seasonal] = await Promise.all([ipcInvoke('load-credentials'), ipcInvoke('load-seasonal-data')]);

        updateSc({ username: creds.smartCookie.username || '' });

        // Restore SC verification status only if full credentials (including password) are present
        if (seasonal.troop && creds.smartCookie.username && creds.smartCookie.hasPassword) {
          updateSc({
            verified: {
              troopName: seasonal.troop?.role?.troop_name || null,
              cookieCount: seasonal.cookies?.length || 0
            }
          });
        }
      } catch (error) {
        Logger.error('Error loading SC settings:', error);
      }
    })();
  }, []);

  const handleVerifySC = async () => {
    if (!sc.username.trim() || !sc.password.trim()) {
      updateSc({ error: 'Email and password are required' });
      return;
    }

    updateSc({ verifying: true, error: null, verified: null });

    try {
      const result = await ipcInvoke('verify-sc', {
        username: sc.username.trim(),
        password: sc.password.trim()
      });

      updateSc({
        verified: {
          troopName: result.troop.role?.troop_name || null,
          cookieCount: result.cookies?.length || 0
        },
        password: '' // Clear password now that it's saved to keychain
      });

      await Promise.all([
        ipcInvoke('save-seasonal-data', { troop: result.troop, cookies: result.cookies }),
        saveCredentials({ smartCookie: { username: sc.username.trim(), password: sc.password.trim() } })
      ]);
    } catch (error) {
      updateSc({ error: getErrorMessage(error) });
    } finally {
      updateSc({ verifying: false });
    }
  };

  const handleClearSC = async () => {
    updateSc({ username: '', password: '', verified: null, error: null });
    await Promise.all([
      ipcInvoke('save-seasonal-data', { troop: null, cookies: null }),
      saveCredentials({ smartCookie: { username: '', password: '' } })
    ]);
  };

  return { sc, updateSc, handleVerifySC, handleClearSC };
}

function useDCForm() {
  const [dc, setDc] = useState({
    username: '',
    password: '',
    verifying: false,
    roles: [] as DCRole[],
    selectedRole: '',
    confirmed: false,
    error: null as string | null
  });
  const updateDc = (patch: Partial<typeof dc>) => setDc((prev) => ({ ...prev, ...patch }));

  // Load existing DC credentials + seasonal data on mount
  useEffect(() => {
    (async () => {
      try {
        const [creds, seasonal] = await Promise.all([ipcInvoke('load-credentials'), ipcInvoke('load-seasonal-data')]);

        updateDc({ username: creds.digitalCookie.username || '' });

        // Restore DC roles only if full credentials (including password) are present
        if (seasonal.dcRoles && seasonal.dcRoles.length > 0 && creds.digitalCookie.username && creds.digitalCookie.hasPassword) {
          const selectedRole = creds.digitalCookie.role || seasonal.dcRoles.find((r) => r.name.startsWith('Troop'))?.name || '';
          updateDc({ roles: seasonal.dcRoles, confirmed: true, selectedRole });
        }
      } catch (error) {
        Logger.error('Error loading DC settings:', error);
      }
    })();
  }, []);

  const handleVerifyDC = async () => {
    if (!dc.username.trim() || !dc.password.trim()) {
      updateDc({ error: 'Email and password are required' });
      return;
    }

    updateDc({ verifying: true, error: null, roles: [] });

    try {
      const result = await ipcInvoke('verify-dc', {
        username: dc.username.trim(),
        password: dc.password.trim()
      });

      // Auto-select first Troop role
      const troopRole = result.roles.find((r) => r.name.startsWith('Troop'));
      const selectedRole = troopRole?.name || (result.roles.length > 0 ? result.roles[0].name : '');

      updateDc({ roles: result.roles, selectedRole, password: '' });

      await Promise.all([
        ipcInvoke('save-seasonal-data', { dcRoles: result.roles }),
        saveCredentials({
          digitalCookie: { username: dc.username.trim(), password: dc.password.trim(), role: selectedRole || undefined }
        })
      ]);
    } catch (error) {
      updateDc({ error: getErrorMessage(error) });
    } finally {
      updateDc({ verifying: false });
    }
  };

  const handleConfirmDC = async () => {
    if (!dc.selectedRole) return;
    await saveCredentials({ digitalCookie: { role: dc.selectedRole } });
    updateDc({ confirmed: true });
  };

  const handleClearDC = async () => {
    updateDc({ username: '', password: '', roles: [], selectedRole: '', confirmed: false, error: null });
    await Promise.all([
      ipcInvoke('save-seasonal-data', { dcRoles: null }),
      saveCredentials({ digitalCookie: { username: '', password: '' } })
    ]);
  };

  return { dc, updateDc, handleVerifyDC, handleConfirmDC, handleClearDC };
}

export function SettingsPage({ mode, onComplete }: SettingsPageProps) {
  const { sc, updateSc, handleVerifySC, handleClearSC } = useSCForm();
  const { dc, updateDc, handleVerifyDC, handleConfirmDC, handleClearDC } = useDCForm();

  // Handle welcome-mode completion when both credentials are verified
  useEffect(() => {
    if (mode !== 'welcome') return;
    if (sc.verified && dc.confirmed) onComplete?.();
  }, [mode, sc.verified, dc.confirmed]);

  return (
    <div>
      {mode === 'welcome' ? (
        <div class="welcome-header">
          <div class="welcome-icon">&#x1F36A;</div>
          <h2>Cookie Tracker</h2>
          <p class="settings-welcome-message">
            One-time setup — enter your Smart Cookie and Digital Cookie logins below.
            <br />
            Credentials are encrypted on disk using your OS keychain.
          </p>
        </div>
      ) : (
        <h3>Logins</h3>
      )}
      <div class="settings-cards">
        <CredentialForm
          label="Smart Cookie"
          idPrefix="sc"
          username={sc.username}
          password={sc.password}
          onUpdateUsername={(value) => updateSc({ username: value })}
          onUpdatePassword={(value) => updateSc({ password: value })}
          onSubmit={() => {
            if (!sc.verifying && !sc.verified) handleVerifySC();
          }}
          verifying={sc.verifying}
          verified={!!sc.verified}
          confirmed={!!sc.verified}
          disabled={!!sc.verified}
          buttonLabel={sc.verified ? 'Verified' : sc.verifying ? 'Verifying...' : 'Verify'}
          error={sc.error}
          onClear={handleClearSC}
          statusIndicators={
            sc.verified && (
              <div class="settings-status-indicators">
                {sc.verified.troopName && (
                  <span class="settings-status-ok">
                    {'\u2713'} Troop {sc.verified.troopName}
                  </span>
                )}
                {sc.verified.cookieCount > 0 && (
                  <span class="settings-status-ok">
                    {'\u2713'} {sc.verified.cookieCount} cookie types
                  </span>
                )}
              </div>
            )
          }
        />
        <CredentialForm
          label="Digital Cookie"
          idPrefix="dc"
          username={dc.username}
          password={dc.password}
          onUpdateUsername={(value) => updateDc({ username: value })}
          onUpdatePassword={(value) => updateDc({ password: value })}
          onSubmit={() => {
            if (dc.roles.length > 0 && !dc.confirmed) handleConfirmDC();
            else if (!dc.verifying && dc.roles.length === 0) handleVerifyDC();
          }}
          verifying={dc.verifying}
          verified={dc.roles.length > 0}
          confirmed={dc.confirmed}
          disabled={dc.roles.length > 0}
          buttonLabel={dc.confirmed ? 'Verified' : dc.roles.length > 0 ? 'Confirm' : dc.verifying ? 'Verifying...' : 'Verify'}
          error={dc.error}
          onClear={handleClearDC}
          extraFields={
            dc.roles.length > 0 && (
              <div class="form-group">
                <label for="dcRoleSelect">Role:</label>
                <select
                  id="dcRoleSelect"
                  class="form-input"
                  value={dc.selectedRole}
                  disabled={dc.confirmed}
                  onChange={(e) => updateDc({ selectedRole: (e.target as HTMLSelectElement).value })}
                >
                  {dc.roles.map((role) => (
                    <option key={role.id} value={role.name}>
                      {role.name}
                    </option>
                  ))}
                </select>
                {!dc.confirmed && <span class="settings-role-hint">Select the role associated with this troop</span>}
              </div>
            )
          }
        />
      </div>
    </div>
  );
}
