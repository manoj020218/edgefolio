const express = require('express');
const { testConnectionHandler, pullFromMachineHandler } = require('../controllers/machineController');

const router = express.Router();
router.post('/test',  testConnectionHandler);
router.post('/pull',  pullFromMachineHandler);
module.exports = router;
