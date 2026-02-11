/**
 * Simple logging utility with development/production mode support
 */

function log(method: 'log' | 'warn' | 'error', prefix: string, message: string, data: unknown): void {
  if (data !== null) {
    console[method](`[${prefix}] ${message}`, data);
  } else {
    console[method](`[${prefix}] ${message}`);
  }
}

const Logger = {
  debug(message: string, data: unknown = null): void {
    if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
      log('log', 'DEBUG', message, data);
    }
  },

  info(message: string, data: unknown = null): void {
    log('log', 'INFO', message, data);
  },

  warn(message: string, data: unknown = null): void {
    log('warn', 'WARN', message, data);
  },

  error(message: string, error: unknown = null): void {
    log('error', 'ERROR', message, error);
  }
};

export default Logger;
