/**
 * Request utilities for rate limiting and retry logic
 */

import Logger from '../logger';

/**
 * Rate limiting configuration
 */
const RATE_LIMIT = {
  REQUEST_DELAY: 500, // 500ms between requests
  RETRY_DELAY_BASE: 1000, // Base delay for exponential backoff (1 second)
  MAX_RETRIES: 3, // Maximum retry attempts
  BACKOFF_MULTIPLIER: 2 // Exponential backoff multiplier
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Add delay between requests for rate limiting
 */
async function rateLimit(): Promise<void> {
  await sleep(RATE_LIMIT.REQUEST_DELAY);
}

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number): number {
  return RATE_LIMIT.RETRY_DELAY_BASE * RATE_LIMIT.BACKOFF_MULTIPLIER ** attempt;
}

/**
 * Check if error indicates session timeout (401/403)
 */
function isSessionExpired(error: any): boolean {
  if (!error) return false;

  // Check axios response
  if (error.response) {
    const status = error.response.status;
    return status === 401 || status === 403;
  }

  // Check error message for auth-related keywords
  const message = error.message?.toLowerCase() || '';
  return (
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('authentication') ||
    message.includes('session expired')
  );
}

/**
 * Check if error indicates rate limiting (429)
 */
function isRateLimited(error: any): boolean {
  if (!error) return false;

  if (error.response) {
    return error.response.status === 429;
  }

  const message = error.message?.toLowerCase() || '';
  return message.includes('rate limit') || message.includes('too many requests');
}

/**
 * Handle a failed request attempt: re-authenticate, backoff, or throw.
 * Throws if unrecoverable; returns normally if the caller should retry.
 */
async function handleRequestError(
  error: any,
  attempt: number,
  maxRetries: number,
  reloginFn: (() => Promise<boolean>) | null,
  logPrefix: string
): Promise<void> {
  const isLastAttempt = attempt === maxRetries - 1;

  if (isSessionExpired(error) && !isLastAttempt && reloginFn) {
    Logger.warn(`${logPrefix}: Session expired (${error.response?.status || 'auth error'})`);
    Logger.info(`${logPrefix}: Attempting re-authentication...`);
    try {
      await reloginFn();
      Logger.info(`${logPrefix}: Re-authentication successful, retrying request`);
      return;
    } catch (loginError) {
      throw new Error(`Session expired and re-authentication failed: ${loginError.message}`);
    }
  }

  if (isRateLimited(error) && !isLastAttempt) {
    Logger.warn(`${logPrefix}: Rate limited (429)`);
    const backoffDelay = getBackoffDelay(attempt) * 2;
    Logger.info(`${logPrefix}: Backing off for ${backoffDelay}ms`);
    await sleep(backoffDelay);
    return;
  }

  if (isLastAttempt) {
    Logger.error(`${logPrefix}: Failed after ${maxRetries} attempts:`, error);
    throw error;
  }

  Logger.warn(`${logPrefix}: Request failed (attempt ${attempt + 1}/${maxRetries}):`, error.message);
}

/**
 * Execute request with automatic retry on session expiry
 */
async function requestWithRetry(
  requestFn: () => Promise<any>,
  reloginFn: (() => Promise<boolean>) | null,
  options: { maxRetries?: number; retryableStatuses?: number[]; logPrefix?: string; rateLimit?: boolean } = {}
): Promise<any> {
  const maxRetries = options.maxRetries || RATE_LIMIT.MAX_RETRIES;
  const logPrefix = options.logPrefix || 'Request';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = getBackoffDelay(attempt - 1);
        Logger.debug(`${logPrefix}: Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
      } else if (options.rateLimit !== false) {
        await rateLimit();
      }

      const result = await requestFn();
      if (attempt > 0) Logger.info(`${logPrefix}: Retry successful on attempt ${attempt + 1}`);
      return result;
    } catch (error) {
      await handleRequestError(error, attempt, maxRetries, reloginFn, logPrefix);
    }
  }

  throw new Error(`${logPrefix}: Max retries exceeded`);
}

export { requestWithRetry };
