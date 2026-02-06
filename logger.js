/**
 * Simple logging utility with development/production mode support
 */
const Logger = {
  /**
   * Log debug information (only in development)
   * @param {string} message - Log message
   * @param {*} data - Optional data to log
   */
  debug(message, data = null) {
    if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
      if (data !== null) {
        console.log(`[DEBUG] ${message}`, data);
      } else {
        console.log(`[DEBUG] ${message}`);
      }
    }
  },

  /**
   * Log informational messages
   * @param {string} message - Log message
   * @param {*} data - Optional data to log
   */
  info(message, data = null) {
    if (data !== null) {
      console.log(`[INFO] ${message}`, data);
    } else {
      console.log(`[INFO] ${message}`);
    }
  },

  /**
   * Log warnings
   * @param {string} message - Warning message
   * @param {*} data - Optional data to log
   */
  warn(message, data = null) {
    if (data !== null) {
      console.warn(`[WARN] ${message}`, data);
    } else {
      console.warn(`[WARN] ${message}`);
    }
  },

  /**
   * Log errors
   * @param {string} message - Error message
   * @param {Error|*} error - Optional error object or data
   */
  error(message, error = null) {
    if (error !== null) {
      console.error(`[ERROR] ${message}`, error);
    } else {
      console.error(`[ERROR] ${message}`);
    }
  }
};

module.exports = Logger;
