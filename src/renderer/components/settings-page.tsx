// SettingsPage — Credential management with verification
// SettingsToggles — App toggle settings, profile management, import modal

import { useEffect, useRef, useState } from 'preact/hooks';
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
        <>
          <h2>Welcome</h2>
          <p class="settings-welcome-message">
            One-time setup — enter your Smart Cookie and Digital Cookie logins below. Credentials are encrypted on disk using your OS
            keychain.
          </p>
        </>
      ) : (
        <h3>Logins</h3>
      )}
      <div class="settings-cards">
        {/* Smart Cookie Section */}
        <div class="settings-card">
          <h3>Smart Cookie</h3>
          <form
            class="settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!sc.verifying && !sc.verified) handleVerifySC();
            }}
          >
            <div class="form-group">
              <label for="scUsername">Email:</label>
              <input
                type="text"
                id="scUsername"
                class="form-input"
                placeholder="Enter email"
                value={sc.username}
                disabled={!!sc.verified}
                onInput={(e) => updateSc({ username: (e.target as HTMLInputElement).value })}
              />
            </div>
            <div class="form-group">
              <label for="scPassword">Password:</label>
              <input
                type="password"
                id="scPassword"
                class="form-input"
                placeholder="Enter password"
                value={sc.verified ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : sc.password}
                disabled={!!sc.verified}
                onInput={(e) => updateSc({ password: (e.target as HTMLInputElement).value })}
              />
            </div>
            <div class="settings-verify-row">
              <button type="submit" class="btn btn-secondary" disabled={sc.verifying || !!sc.verified}>
                {sc.verified ? 'Verified' : sc.verifying ? 'Verifying...' : 'Verify'}
              </button>
              {sc.verified && (
                <button type="button" class="btn btn-secondary" onClick={handleClearSC}>
                  Clear
                </button>
              )}
              {sc.error && <span class="settings-error">{sc.error}</span>}
            </div>
            {sc.verified && (
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
              if (dc.roles.length > 0 && !dc.confirmed) handleConfirmDC();
              else if (!dc.verifying && dc.roles.length === 0) handleVerifyDC();
            }}
          >
            <div class="form-group">
              <label for="dcUsername">Email:</label>
              <input
                type="text"
                id="dcUsername"
                class="form-input"
                placeholder="Enter email"
                value={dc.username}
                disabled={dc.roles.length > 0}
                onInput={(e) => updateDc({ username: (e.target as HTMLInputElement).value })}
              />
            </div>
            <div class="form-group">
              <label for="dcPassword">Password:</label>
              <input
                type="password"
                id="dcPassword"
                class="form-input"
                placeholder="Enter password"
                value={dc.roles.length > 0 ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : dc.password}
                disabled={dc.roles.length > 0}
                onInput={(e) => updateDc({ password: (e.target as HTMLInputElement).value })}
              />
            </div>
            {dc.roles.length > 0 && (
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
            )}
            <div class="settings-verify-row">
              <button type="submit" class="btn btn-secondary" disabled={dc.verifying || dc.confirmed}>
                {dc.confirmed ? 'Verified' : dc.roles.length > 0 ? 'Confirm' : dc.verifying ? 'Verifying...' : 'Verify'}
              </button>
              {dc.roles.length > 0 && (
                <button type="button" class="btn btn-secondary" onClick={handleClearDC}>
                  Clear
                </button>
              )}
              {dc.error && <span class="settings-error">{dc.error}</span>}
            </div>
          </form>
        </div>
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
  onImportProfile: (name: string) => void;
  onDeleteProfile: (dirName: string) => void;
  onExport: () => void;
  onInjectDebug: () => void;
  hasData: boolean;
}

function ImportModal({ onImport, onClose }: { onImport: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      class="modal-overlay"
      ref={backdropRef}
      role="dialog"
      onClick={(e) => e.target === backdropRef.current && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div class="modal-content">
        <h3>Import Data</h3>
        <p class="muted-text">Import a previously exported .zip file as a read-only snapshot.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              onImport(name.trim());
              onClose();
            }
          }}
        >
          <div class="form-group">
            <label for="importName">Profile name:</label>
            <input
              type="text"
              id="importName"
              class="form-input"
              placeholder="e.g. Week 3 Backup"
              value={name}
              // biome-ignore lint/a11y/noAutofocus: modal focus
              autoFocus
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" disabled={!name.trim()}>
              Choose File & Import
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SettingsToggles({
  appConfig,
  readOnly,
  onUpdateConfig,
  activeProfile,
  profiles,
  onSwitchProfile,
  onImportProfile,
  onDeleteProfile,
  onExport,
  onInjectDebug,
  hasData
}: SettingsTogglesProps) {
  const [imessageRecipient, setImessageRecipient] = useState('');
  const [imessageSending, setImessageSending] = useState(false);
  const [imessageError, setImessageError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

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
        <label class="toggle-switch">
          <input
            type="checkbox"
            checked={appConfig?.inventoryHistoryEnabled ?? false}
            disabled={readOnly}
            onChange={(e) => onUpdateConfig({ inventoryHistoryEnabled: (e.target as HTMLInputElement).checked })}
          />
          <span class="toggle-slider" />
          <span class="toggle-label">Show Inventory History Report</span>
        </label>
        <label class="toggle-switch">
          <input
            type="checkbox"
            checked={appConfig?.availableBoothsEnabled ?? false}
            disabled={readOnly}
            onChange={(e) => onUpdateConfig({ availableBoothsEnabled: (e.target as HTMLInputElement).checked })}
          />
          <span class="toggle-slider" />
          <span class="toggle-label">Booth Finder</span>
        </label>
        {appConfig?.availableBoothsEnabled && (
          <div class="settings-toggle-sub">
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
          </div>
        )}
      </div>
      {profiles.length > 0 && (
        <>
          <div class="profile-controls" style={{ marginTop: '16px' }}>
            <select
              class="form-input profile-select"
              value={activeProfile?.dirName || 'default'}
              onChange={(e) => onSwitchProfile((e.target as HTMLSelectElement).value)}
            >
              {profiles.map((p) => (
                <option key={p.dirName} value={p.dirName}>
                  {p.dirName === 'default' ? 'Default' : p.name}
                </option>
              ))}
            </select>
            <button type="button" class="btn btn-secondary" onClick={() => setShowImportModal(true)}>
              Import Data
            </button>
            {readOnly && <span class="profile-hint">Imported snapshot — syncing disabled</span>}
          </div>
          <div class="button-group" style={{ marginTop: '12px' }}>
            <button type="button" class="btn btn-secondary" disabled={!hasData} onClick={onExport}>
              Export Data
            </button>
            <button type="button" class="btn btn-secondary" disabled={!hasData} onClick={onInjectDebug}>
              Inject Debug Data
            </button>
            {readOnly && (
              <button type="button" class="btn btn-secondary" onClick={() => activeProfile && onDeleteProfile(activeProfile.dirName)}>
                Delete Profile
              </button>
            )}
          </div>
        </>
      )}
      {showImportModal && <ImportModal onImport={onImportProfile} onClose={() => setShowImportModal(false)} />}
    </div>
  );
}
