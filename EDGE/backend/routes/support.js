const express = require('express');
const { createTicketHandler, listTicketsHandler } = require('../controllers/supportController');

const router = express.Router();

router.post('/', createTicketHandler);
router.get('/', listTicketsHandler);

module.exports = router;
