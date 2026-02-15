/**
 * Logger — writes to a log file in the app's data directory.
 *
 * Main process: writes directly to disk via fs.
 * Renderer process: sends log lines to main via IPC (fire-and-forget).
 *
 * The log file is truncated each time the main process calls Logger.init(),
 * so it always contains only the current session's logs.
 */

// Dynamic imports — only available in main process (renderer has nodeIntegration: false)
let fs: typeof import('node:fs') | null = null;
let path: typeof import('node:path') | null = null;
try {
  fs = require('node:fs');
  path = require('node:path');
} catch {
  // Renderer process — fs/path not available, will use IPC relay instead
}

let logStream: import('node:fs').WriteStream | null = null;
let isRenderer = false;

function formatData(data: unknown): string {
  if (data === null || data === undefined) return '';
  if (data instanceof Error) return ` ${data.message}`;
  if (typeof data === 'string') return ` ${data}`;
  try {
    return ` ${JSON.stringify(data)}`;
  } catch {
    return ` ${String(data)}`;
  }
}

function timestamp(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function writeLine(level: string, message: string, data: unknown): void {
  const prefix = isRenderer ? 'R' : 'M';
  const line = `${timestamp()} [${prefix}] [${level}] ${message}${formatData(data)}\n`;

  // Always log to console
  if (level === 'ERROR') console.error(line.trimEnd());
  else if (level === 'WARN') console.warn(line.trimEnd());
  else console.log(line.trimEnd());

  if (isRenderer) {
    // Fire-and-forget to main process
    try {
      (window as any).electronAPI?.invoke('log-message', line).catch(() => {});
    } catch {
      // Ignore — electronAPI may not be ready yet
    }
    return;
  }

  // Main process: write to file
  if (logStream) {
    logStream.write(line);
  }
}

const Logger = {
  /**
   * Initialize file logging. Call once from main process at startup.
   * Truncates the log file so only the current session is kept.
   */
  init(dataDir: string): void {
    if (!fs || !path) return;
    const logFilePath = path.join(dataDir, 'app.log');
    // Close previous stream (e.g. root-level → profile-level switch)
    if (logStream) {
      logStream.end();
      logStream = null;
    }
    // Truncate — fresh log for each session
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      logStream = fs.createWriteStream(logFilePath, { flags: 'w' });
      logStream.on('error', (err) => {
        console.error('Log stream error:', err);
        logStream = null;
      });
    } catch (err) {
      console.error('Failed to create log file:', err);
    }
    writeLine('INFO', `=== Session started (${new Date().toISOString()}) ===`, null);
  },

  /** Call from renderer process to mark logs with [R] prefix */
  initRenderer(): void {
    isRenderer = true;
  },

  /** Append a raw line from the renderer (called by main IPC handler) */
  appendLine(line: string): void {
    if (logStream) {
      logStream.write(line.endsWith('\n') ? line : `${line}\n`);
    }
  },

  debug(message: string, data: unknown = null): void {
    writeLine('DEBUG', message, data);
  },

  info(message: string, data: unknown = null): void {
    writeLine('INFO', message, data);
  },

  warn(message: string, data: unknown = null): void {
    writeLine('WARN', message, data);
  },

  error(message: string, error: unknown = null): void {
    writeLine('ERROR', message, error);
  },

  /** Flush and close the log stream (call before app exits) */
  close(): void {
    if (logStream) {
      logStream.end();
      logStream = null;
    }
  }
};

export default Logger;
