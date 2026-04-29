const { app } = require('./server');
const { HOST, PORT } = require('./config/app');
const { getDb, closeDb } = require('./config/database');
const logger = require('./utils/logger');
const { startSchedulers } = require('./jobs');

getDb();
const schedulerManager = startSchedulers();

const server = app.listen(PORT, HOST, () => {
  logger.info('EDGE backend started', {
    host: HOST,
    port: PORT,
  });
});

function shutdown(signal) {
  logger.info('Shutting down EDGE backend', { signal });
  schedulerManager.stopAll();
  server.close(() => {
    closeDb();
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = {
  server,
};
