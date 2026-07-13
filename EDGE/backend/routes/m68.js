'use strict';
const express = require('express');
const ctrl = require('../controllers/m68Controller');

const router = express.Router();

// Device CRUD
router.get   ('/devices',            ctrl.listDevicesHandler);
router.post  ('/devices',            ctrl.createDeviceHandler);
router.put   ('/devices/:id',        ctrl.updateDeviceHandler);
router.delete('/devices/:id',        ctrl.deleteDeviceHandler);

// Per-device enrolled user list (from GET_USER_ID_LIST results)
router.get   ('/devices/:id/users',  ctrl.listDeviceUsersHandler);

// Listener + device summaries
router.get('/status', ctrl.getStatusHandler);

// Queue a command (allowlisted: SET_TIME, GET_LOG_DATA, GET_DEVICE_STATUS)
router.post('/command', ctrl.queueCommandHandler);

// Recent events (unregistered sightings, enroll, barcode, operation)
router.get('/events', ctrl.listEventsHandler);

module.exports = router;
