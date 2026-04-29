const { getSyncStatus, pushToCloud } = require('../services/syncService');
const { sendOk } = require('../utils/http');
const { serializeSyncStatus } = require('../utils/serializers');

function syncStatusHandler(_req, res) {
  const status = serializeSyncStatus(getSyncStatus());
  sendOk(res, status);
}

async function syncPushHandler(_req, res, next) {
  try {
    const result = await pushToCloud();
    sendOk(res, {
      status: serializeSyncStatus(result.status),
      frp: result.frp,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  syncStatusHandler,
  syncPushHandler,
};
