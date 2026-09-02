const express = require('express');
const { createRequestHandler, listRequestsHandler, getRequestHandler } = require('../controllers/requestsController');

const router = express.Router();

router.post('/', createRequestHandler);
router.get('/', listRequestsHandler);
router.get('/:id', getRequestHandler);

module.exports = router;
