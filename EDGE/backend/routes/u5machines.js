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

// Send a command to a device (open door, restart, etc.) — MQTT mode
router.post('/command', ctrl.sendCommandHandler);

// Per-machine preferences (face photo storage, embedded port, VPS creds)
router.get('/preferences',  ctrl.getPreferencesHandler);
router.put('/preferences',  ctrl.updatePreferencesHandler);

// ── HTTP mode endpoints (connection_mode='http' devices) ──────────────────────
// Enroll a face: POST /u5/enroll  { deviceSn, idNumber, name, picLarge, cardNumber? }
router.post('/enroll',   ctrl.enrollFaceHandler);

// Delete enrolled person: DELETE /u5/employee  { deviceSn, userId }
router.delete('/employee', ctrl.deleteEmployeeHandler);

// List enrolled persons on device: GET /u5/devices/:deviceSn/employees
router.get('/devices/:deviceSn/employees', ctrl.listDeviceEmployeesHandler);

// Open door relay: POST /u5/open-door  { deviceSn }
router.post('/open-door', ctrl.openDoorHandler);

// Ping / device info: GET /u5/devices/:deviceSn/ping
router.get('/devices/:deviceSn/ping', ctrl.pingDeviceHandler);

// Read firmware/SN: GET /u5/devices/:deviceSn/info
router.get('/devices/:deviceSn/info', ctrl.getDeviceInfoHandler);

module.exports = router;
