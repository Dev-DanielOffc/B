const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const currentLevel = LEVELS[process.env.LOG_LEVEL || 'info'] ?? LEVELS.info;

function timestamp() {
  return new Date().toISOString();
}

function log(level, message, meta) {
  if (LEVELS[level] < currentLevel) return;

  const line = `[${timestamp()}] [${level.toUpperCase()}] ${message}`;

  if (meta !== undefined) {
    try {
      console.log(line, JSON.stringify(meta));
    } catch (err) {
      console.log(line, String(meta));
    }
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg, meta) => log('debug', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta)
};