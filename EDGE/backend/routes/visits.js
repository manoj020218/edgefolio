const express = require('express');
const {
  createVisitHandler,
  listTodayVisitsHandler,
  checkInVisitHandler,
  completeVisitHandler,
} = require('../controllers/visitsController');

const router = express.Router();

router.post('/', createVisitHandler);
router.get('/today', listTodayVisitsHandler);
router.post('/:id/check-in', checkInVisitHandler);
router.post('/:id/complete', completeVisitHandler);

module.exports = router;
