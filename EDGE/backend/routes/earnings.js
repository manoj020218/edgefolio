const express = require('express');
const { listEarningsHandler, createEarningHandler, updateEarningHandler, deleteEarningHandler } = require('../controllers/earningsController');
const router = express.Router();
router.get('/',      listEarningsHandler);
router.post('/',     createEarningHandler);
router.put('/:id',   updateEarningHandler);
router.delete('/:id', deleteEarningHandler);
module.exports = router;
