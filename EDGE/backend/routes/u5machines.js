const express = require('express');
const ctrl = require('../controllers/u5Controller');

const router = express.Router();

// Device CRUD
router.get   ('/devices',      ctrl.listDevicesHandler);
router.post  ('/devices',      ctrl.createDeviceHandler);
router.put   ('/devices/:id',  ctrl.updateDeviceHandler);
router.delete('/devices/:id',  ctrl.deleteDeviceHandler);

// Live status of broker + connected devices
router.get('/status', ctrl.getStatusHandler);

// Send a command to a device (open door, restart, etc.)
router.post('/command', ctrl.sendCommandHandler);

// Per-machine preferences (face photo storage, embedded port, VPS creds)
router.get('/preferences',  ctrl.getPreferencesHandler);
router.put('/preferences',  ctrl.updatePreferencesHandler);

module.exports = router;
