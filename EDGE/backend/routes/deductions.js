const express = require('express');
const { listHandler, createHandler, updateHandler, deleteHandler } = require('../controllers/deductionController');

const router = express.Router();
router.get('/',       listHandler);
router.post('/',      createHandler);
router.put('/:id',    updateHandler);
router.delete('/:id', deleteHandler);
module.exports = router;
