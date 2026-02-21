// SettingsToggles — App toggle settings, profile management

import { useEffect, useState } from 'preact/hooks';
import { getErrorMessage } from '../../logger';
import type { AppConfig, AppConfigPatch } from '../../types';
import { ipcInvoke } from '../ipc';

// ============================================================================
// BOOTH FINDER SETTINGS
// ============================================================================

interface BoothFinderSettingsProps {
  appConfig: AppConfig;
  readOnly: boolean;
  onUpdateConfig: (patch: AppConfigPatch) => void;
}

function BoothFinderSettings({ appConfig, readOnly, onUpdateConfig }: BoothFinderSettingsProps) {
  const [imessageRecipient, setImessageRecipient] = useState('');
  const [imessageSending, setImessageSending] = useState(false);
  const [imessageError, setImessageError] = useState<string | null>(null);

  useEffect(() => {
    if (appConfig.boothFinder?.imessageRecipient) setImessageRecipient(appConfig.boothFinder.imessageRecipient);
  }, [appConfig.boothFinder?.imessageRecipient]);

  if (!appConfig.boothFinder) return null;

  return (
    <>
      <label class="toggle-switch">
        <input
          type="checkbox"
          checked={appConfig.boothFinder.enabled ?? false}
          disabled={readOnly}
          onChange={(e) => onUpdateConfig({ boothFinder: { enabled: (e.target as HTMLInputElement).checked } })}
        />
        <span class="toggle-slider" />
        <span class="toggle-label">Booth Finder</span>
      </label>
      {appConfig.boothFinder.enabled && (
        <label class="toggle-switch">
          <input
            type="checkbox"
            checked={appConfig.boothFinder.imessage ?? false}
            disabled={readOnly}
            onChange={(e) => onUpdateConfig({ boothFinder: { imessage: (e.target as HTMLInputElement).checked } })}
          />
          <span class="toggle-slider" />
          <span class="toggle-label">iMessage Alerts</span>
        </label>
      )}
      {appConfig.boothFinder.enabled && appConfig.boothFinder.imessage && (
        <div class="imessage-setup">
          <div class="imessage-input-row">
            <input
              type="text"
              class="form-input"
              placeholder="Phone number or Apple ID"
              value={appConfig.boothFinder.imessageRecipient ? appConfig.boothFinder.imessageRecipient : imessageRecipient}
              disabled={!!appConfig.boothFinder.imessageRecipient || imessageSending}
              onInput={(e) => setImessageRecipient((e.target as HTMLInputElement).value)}
            />
            {!appConfig.boothFinder.imessageRecipient ? (
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
                    onUpdateConfig({ boothFinder: { imessageRecipient: imessageRecipient.trim() } });
                  } catch (err) {
                    setImessageError(getErrorMessage(err));
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
                  onUpdateConfig({ boothFinder: { imessageRecipient: '' } });
                }}
              >
                Clear
              </button>
            )}
          </div>
          {imessageError && <span class="settings-error">{imessageError}</span>}
          {!appConfig.boothFinder.imessageRecipient && (
            <span class="settings-role-hint">A test message will be sent to verify delivery</span>
          )}
        </div>
      )}
    </>
  );
}

// ============================================================================
// SETTINGS TOGGLES
// ============================================================================

interface SettingsTogglesProps {
  appConfig: AppConfig | null;
  readOnly: boolean;
  onUpdateConfig: (patch: AppConfigPatch) => void;
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
  return (
    <div>
      {profiles.length > 1 && (
        <>
          <h3>Profiles</h3>
          <div class="settings-toggles">
            {profiles.map((p) => {
              const isActive = p.dirName === (activeProfile?.dirName || 'default');
              const isDefault = p.dirName === 'default';
              return (
                <div key={p.dirName} class={`profile-row ${isActive ? 'profile-row-active' : ''}`}>
                  <span class="profile-name">{isDefault ? 'Default' : p.name}</span>
                  {isActive && <span class="profile-active-badge">Active</span>}
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
        </>
      )}
      <h3>Settings</h3>
      <div class="settings-toggles">
        <label class="toggle-switch">
          <input
            type="checkbox"
            checked={appConfig?.autoUpdate ?? false}
            disabled={readOnly}
            onChange={(e) => onUpdateConfig({ autoUpdate: (e.target as HTMLInputElement).checked })}
          />
          <span class="toggle-slider" />
          <span class="toggle-label">Check for Updates</span>
        </label>
        {appConfig && <BoothFinderSettings appConfig={appConfig} readOnly={readOnly} onUpdateConfig={onUpdateConfig} />}
        <button type="button" class="btn btn-secondary" style={{ alignSelf: 'flex-start' }} disabled={!hasData} onClick={onExport}>
          Export Data
        </button>
      </div>
    </div>
  );
}
