import { ipcMain } from 'electron';
import { DigitalCookieSession } from '../scrapers/dc-session';
import { SmartCookieSession } from '../scrapers/sc-session';
import type { CredentialPatch, CredentialsSummary } from '../types';
import { validateCredentialPatch } from '../validators';
import type { HandlerDeps } from './types';

export function registerCredentialHandlers(deps: HandlerDeps): void {
  const { credentialsManager, handleIpcError } = deps;

  // Handle load credentials — returns summary without passwords
  ipcMain.handle(
    'load-credentials',
    handleIpcError(async (): Promise<CredentialsSummary> => {
      const creds = credentialsManager.loadCredentials();
      return {
        smartCookie: {
          username: creds.smartCookie.username || '',
          hasPassword: !!creds.smartCookie.password
        },
        digitalCookie: {
          username: creds.digitalCookie.username || '',
          hasPassword: !!creds.digitalCookie.password,
          role: creds.digitalCookie.role,
          councilId: creds.digitalCookie.councilId
        }
      };
    })
  );

  // Handle save credentials — merges partial patch with existing credentials
  ipcMain.handle(
    'save-credentials',
    handleIpcError(async (_event: Electron.IpcMainInvokeEvent, patch: CredentialPatch) => {
      const validation = validateCredentialPatch(patch);
      if (!validation.valid) throw new Error(`Invalid credential patch: ${validation.issues.join(', ')}`);
      const existing = credentialsManager.loadCredentials();
      const merged = {
        smartCookie: { ...existing.smartCookie, ...patch.smartCookie },
        digitalCookie: { ...existing.digitalCookie, ...patch.digitalCookie }
      };
      return credentialsManager.saveCredentials(merged);
    })
  );

  // Handle verify Smart Cookie credentials
  ipcMain.handle(
    'verify-sc',
    handleIpcError(async (_event: Electron.IpcMainInvokeEvent, { username, password }: { username: string; password: string }) => {
      if (!username || typeof username !== 'string' || username.length > 256) throw new Error('Invalid username');
      if (!password || typeof password !== 'string' || password.length > 256) throw new Error('Invalid password');
      const session = new SmartCookieSession();
      await session.login(username, password);

      const troop = await session.fetchMe();
      if (!troop) throw new Error('Could not fetch troop info from /me');

      const cookies = await session.apiGet('/webapi/api/me/cookies', 'Cookie map fetch');

      return { troop, cookies: cookies || [] };
    })
  );

  // Handle verify Digital Cookie credentials
  ipcMain.handle(
    'verify-dc',
    handleIpcError(async (_event: Electron.IpcMainInvokeEvent, { username, password }: { username: string; password: string }) => {
      if (!username || typeof username !== 'string' || username.length > 256) throw new Error('Invalid username');
      if (!password || typeof password !== 'string' || password.length > 256) throw new Error('Invalid password');
      const session = new DigitalCookieSession();
      const roles = await session.fetchRoles(username, password);
      return { roles };
    })
  );
}
