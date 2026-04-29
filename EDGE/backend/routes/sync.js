const express = require('express');
const { syncStatusHandler, syncPushHandler } = require('../controllers/syncController');

const router = express.Router();

router.get('/status', syncStatusHandler);
router.post('/push', syncPushHandler);

module.exports = router;
