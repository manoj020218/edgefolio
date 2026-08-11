const fs = require('fs');
const path = require('path');
const { LOG_DIR } = require('../config/app');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function appendLog(fileName, payload) {
  try {
    ensureLogDir();
    fs.appendFileSync(path.join(LOG_DIR, fileName), `${JSON.stringify(payload)}\n`, 'utf8');
  } catch (error) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        message: 'Failed to write log file',
        fileName,
        reason: error.message,
      }),
    );
  }
}

function log(level, message, meta = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  if (level === 'error') {
    console.error(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }

  appendLog('server.log', payload);
  if (level === 'error') {
    appendLog('error.log', payload);
  }

  if (meta.channel === 'sync') {
    appendLog('sync.log', payload);
  }
  if (meta.channel === 'backup') {
    appendLog('backup.log', payload);
  }
  if (meta.channel === 'face') {
    appendLog('face-recognition.log', payload);
  }
}

module.exports = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
};
