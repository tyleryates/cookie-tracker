// SettingsPage — Credential management with verification
// SettingsToggles — App toggle settings, profile management

import type { ComponentChildren } from 'preact';
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

export function SettingsPage({ mode, onComplete }: SettingsPageProps) {
  // Smart Cookie form state
  const [sc, setSc] = useState({
    username: '',
    password: '',
    verifying: false,
    verified: null as SCVerifyResult | null,
    error: null as string | null
  });
  const updateSc = (patch: Partial<typeof sc>) => setSc((prev) => ({ ...prev, ...patch }));

  // Digital Cookie form state
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

  // Load existing credentials + seasonal data on mount
  useEffect(() => {
    (async () => {
      try {
        const [creds, seasonal] = await Promise.all([ipcInvoke('load-credentials'), ipcInvoke('load-seasonal-data')]);

        updateSc({ username: creds.smartCookie.username || '' });
        updateDc({ username: creds.digitalCookie.username || '' });

        // Restore SC verification status only if full credentials (including password) are present
        if (seasonal.troop && creds.smartCookie.username && creds.smartCookie.hasPassword) {
          updateSc({
            verified: {
              troopName: seasonal.troop?.role?.troop_name || null,
              cookieCount: seasonal.cookies?.length || 0
            }
          });
        }

        // Restore DC roles only if full credentials (including password) are present
        if (seasonal.dcRoles && seasonal.dcRoles.length > 0 && creds.digitalCookie.username && creds.digitalCookie.hasPassword) {
          const selectedRole = creds.digitalCookie.role || seasonal.dcRoles.find((r) => r.name.startsWith('Troop'))?.name || '';
          updateDc({ roles: seasonal.dcRoles, confirmed: true, selectedRole });
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
      if (mode === 'welcome' && dc.confirmed) onComplete?.();
    } catch (error) {
      updateSc({ error: (error as Error).message });
    } finally {
      updateSc({ verifying: false });
    }
  };

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
      updateDc({ error: (error as Error).message });
    } finally {
      updateDc({ verifying: false });
    }
  };

  const handleConfirmDC = async () => {
    if (!dc.selectedRole) return;
    await saveCredentials({ digitalCookie: { role: dc.selectedRole } });
    updateDc({ confirmed: true });
    if (mode === 'welcome' && sc.verified) onComplete?.();
  };

  const handleClearSC = async () => {
    updateSc({ username: '', password: '', verified: null, error: null });
    await Promise.all([
      ipcInvoke('save-seasonal-data', { troop: null, cookies: null }),
      saveCredentials({ smartCookie: { username: '', password: '' } })
    ]);
  };

  const handleClearDC = async () => {
    updateDc({ username: '', password: '', roles: [], selectedRole: '', confirmed: false, error: null });
    await Promise.all([
      ipcInvoke('save-seasonal-data', { dcRoles: null }),
      saveCredentials({ digitalCookie: { username: '', password: '' } })
    ]);
  };

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

// ============================================================================
// SETTINGS TOGGLES
// ============================================================================

interface SettingsTogglesProps {
  appConfig: AppConfig | null;
  readOnly: boolean;
  onUpdateConfig: (patch: Partial<AppConfig>) => void;
  activeProfile: import('../../types').ActiveProfile | null;
  profiles: import('../../types').ProfileInfo[];
  onSwitchProfile: (dirName: string) => void;
  onDeleteProfile: (dirName: string) => void;
  onExport: () => void;
  hasData: boolean;
}

export function SettingsToggles({
  appConfig,
  readOnly,
  onUpdateConfig,
  activeProfile,
  profiles,
  onSwitchProfile,
  onDeleteProfile,
  onExport,
  hasData
}: SettingsTogglesProps) {
  const [imessageRecipient, setImessageRecipient] = useState('');
  const [imessageSending, setImessageSending] = useState(false);
  const [imessageError, setImessageError] = useState<string | null>(null);

  useEffect(() => {
    if (appConfig?.boothAlertRecipient) setImessageRecipient(appConfig.boothAlertRecipient);
  }, [appConfig?.boothAlertRecipient]);

  return (
    <div>
      <h3>Settings</h3>
      <div class="settings-toggles">
        <label class="toggle-switch">
          <input
            type="checkbox"
            checked={appConfig?.autoUpdateEnabled ?? false}
            disabled={readOnly}
            onChange={(e) => onUpdateConfig({ autoUpdateEnabled: (e.target as HTMLInputElement).checked })}
          />
          <span class="toggle-slider" />
          <span class="toggle-label">Check for Updates</span>
        </label>
        {appConfig?.availableBoothsEnabled && (
          <>
            <label class="toggle-switch">
              <input
                type="checkbox"
                checked={appConfig?.boothAlertImessage ?? false}
                disabled={readOnly}
                onChange={(e) => onUpdateConfig({ boothAlertImessage: (e.target as HTMLInputElement).checked })}
              />
              <span class="toggle-slider" />
              <span class="toggle-label">iMessage Alerts</span>
            </label>
            {appConfig?.boothAlertImessage && (
              <div style={{ marginTop: '8px' }}>
                <input
                  type="text"
                  class="form-input"
                  placeholder="Your phone number or Apple ID"
                  value={appConfig.boothAlertRecipient ? appConfig.boothAlertRecipient : imessageRecipient}
                  disabled={!!appConfig.boothAlertRecipient || imessageSending}
                  onInput={(e) => setImessageRecipient((e.target as HTMLInputElement).value)}
                />
                <div class="settings-verify-row" style={{ marginTop: '8px' }}>
                  {!appConfig.boothAlertRecipient ? (
                    <button
                      type="button"
                      class="btn btn-secondary"
                      disabled={!imessageRecipient.trim() || imessageSending}
                      onClick={async () => {
                        setImessageSending(true);
                        setImessageError(null);
                        try {
                          await ipcInvoke('send-imessage', {
                            recipient: imessageRecipient.trim(),
                            message: 'Cookie Tracker iMessage alerts are now active!'
                          });
                          onUpdateConfig({ boothAlertRecipient: imessageRecipient.trim() });
                        } catch (err) {
                          setImessageError((err as Error).message);
                        } finally {
                          setImessageSending(false);
                        }
                      }}
                    >
                      {imessageSending ? 'Sending...' : 'Confirm'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      class="btn btn-secondary"
                      onClick={() => {
                        setImessageRecipient('');
                        setImessageError(null);
                        onUpdateConfig({ boothAlertRecipient: '' });
                      }}
                    >
                      Clear
                    </button>
                  )}
                  {imessageError && <span class="settings-error">{imessageError}</span>}
                </div>
                {!appConfig.boothAlertRecipient && <span class="settings-role-hint">A test message will be sent to verify delivery</span>}
              </div>
            )}
          </>
        )}
        {profiles.length > 1 && (
          <div class="profile-list">
            {profiles.map((p) => {
              const isActive = p.dirName === (activeProfile?.dirName || 'default');
              const isDefault = p.dirName === 'default';
              return (
                <div key={p.dirName} class={`profile-row ${isActive ? 'profile-row-active' : ''}`}>
                  <span class="profile-name">{isDefault ? 'Default' : p.name}</span>
                  {!isActive && (
                    <button type="button" class="btn btn-secondary btn-sm" onClick={() => onSwitchProfile(p.dirName)}>
                      Load
                    </button>
                  )}
                  {!isDefault && (
                    <button type="button" class="btn btn-secondary btn-sm" onClick={() => onDeleteProfile(p.dirName)}>
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <button type="button" class="btn btn-secondary" style={{ alignSelf: 'flex-start' }} disabled={!hasData} onClick={onExport}>
          Export Data
        </button>
      </div>
    </div>
  );
}
