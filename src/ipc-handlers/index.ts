import { registerConfigHandlers } from './config-handlers';
import { registerCredentialHandlers } from './credential-handlers';
import { registerDataHandlers } from './data-handlers';
import { registerMiscHandlers } from './misc-handlers';
import { registerProfileHandlers } from './profile-handlers';
import { registerScrapeHandlers } from './scrape-handlers';
import type { HandlerDeps } from './types';

export function registerAllHandlers(deps: HandlerDeps): void {
  registerDataHandlers(deps);
  registerCredentialHandlers(deps);
  registerConfigHandlers(deps);
  registerScrapeHandlers(deps);
  registerProfileHandlers(deps);
  registerMiscHandlers(deps);
}
