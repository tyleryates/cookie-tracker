/**
 * Request utilities for rate limiting and retry logic
 */

const Logger = require('../logger');

/**
 * Rate limiting configuration
 */
const RATE_LIMIT = {
  REQUEST_DELAY: 500,        // 500ms between requests
  RETRY_DELAY_BASE: 1000,    // Base delay for exponential backoff (1 second)
  MAX_RETRIES: 3,            // Maximum retry attempts
  BACKOFF_MULTIPLIER: 2      // Exponential backoff multiplier
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Add delay between requests for rate limiting
 */
async function rateLimit() {
  await sleep(RATE_LIMIT.REQUEST_DELAY);
}

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - Current attempt number (0-indexed)
 * @returns {number} Delay in milliseconds
 */
function getBackoffDelay(attempt) {
  return RATE_LIMIT.RETRY_DELAY_BASE * Math.pow(RATE_LIMIT.BACKOFF_MULTIPLIER, attempt);
}

/**
 * Check if error indicates session timeout (401/403)
 * @param {Error} error - Error object
 * @returns {boolean} True if session expired
 */
function isSessionExpired(error) {
  if (!error) return false;

  // Check axios response
  if (error.response) {
    const status = error.response.status;
    return status === 401 || status === 403;
  }

  // Check error message for auth-related keywords
  const message = error.message?.toLowerCase() || '';
  return message.includes('unauthorized') ||
         message.includes('forbidden') ||
         message.includes('authentication') ||
         message.includes('session expired');
}

/**
 * Check if error indicates rate limiting (429)
 * @param {Error} error - Error object
 * @returns {boolean} True if rate limited
 */
function isRateLimited(error) {
  if (!error) return false;

  if (error.response) {
    return error.response.status === 429;
  }

  const message = error.message?.toLowerCase() || '';
  return message.includes('rate limit') || message.includes('too many requests');
}

/**
 * Execute request with automatic retry on session expiry
 * @param {Function} requestFn - Function that makes the request
 * @param {Function} reloginFn - Function to re-authenticate
 * @param {Object} options - Configuration options
 * @returns {Promise} Request result
 */
async function requestWithRetry(requestFn, reloginFn, options = {}) {
  const maxRetries = options.maxRetries || RATE_LIMIT.MAX_RETRIES;
  const logPrefix = options.logPrefix || 'Request';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Add rate limiting delay before request (except first attempt)
      if (attempt > 0) {
        const delay = getBackoffDelay(attempt - 1);
        Logger.debug(`${logPrefix}: Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
      } else if (options.rateLimit !== false) {
        // Apply standard rate limit on first attempt
        await rateLimit();
      }

      // Execute the request
      const result = await requestFn();

      // Success - return result
      if (attempt > 0) {
        Logger.info(`${logPrefix}: Retry successful on attempt ${attempt + 1}`);
      }
      return result;

    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;

      // Check if session expired
      if (isSessionExpired(error)) {
        Logger.warn(`${logPrefix}: Session expired (${error.response?.status || 'auth error'})`);

        if (!isLastAttempt && reloginFn) {
          Logger.info(`${logPrefix}: Attempting re-authentication...`);
          try {
            await reloginFn();
            Logger.info(`${logPrefix}: Re-authentication successful, retrying request`);
            continue; // Retry after re-login
          } catch (loginError) {
            Logger.error(`${logPrefix}: Re-authentication failed:`, loginError);
            throw new Error(`Session expired and re-authentication failed: ${loginError.message}`);
          }
        }
      }

      // Check if rate limited
      if (isRateLimited(error)) {
        Logger.warn(`${logPrefix}: Rate limited (429)`);

        if (!isLastAttempt) {
          const backoffDelay = getBackoffDelay(attempt) * 2; // Extra delay for rate limiting
          Logger.info(`${logPrefix}: Backing off for ${backoffDelay}ms`);
          await sleep(backoffDelay);
          continue; // Retry after backoff
        }
      }

      // If last attempt or unrecoverable error, throw
      if (isLastAttempt) {
        Logger.error(`${logPrefix}: Failed after ${maxRetries} attempts:`, error);
        throw error;
      }

      // For other errors, retry with exponential backoff
      Logger.warn(`${logPrefix}: Request failed (attempt ${attempt + 1}/${maxRetries}):`, error.message);
    }
  }

  throw new Error(`${logPrefix}: Max retries exceeded`);
}

module.exports = {
  RATE_LIMIT,
  sleep,
  rateLimit,
  getBackoffDelay,
  isSessionExpired,
  isRateLimited,
  requestWithRetry
};
