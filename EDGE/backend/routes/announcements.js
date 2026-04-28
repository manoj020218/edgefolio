const express = require('express');
const {
  listAnnouncementsHandler,
  createAnnouncementHandler,
  deleteAnnouncementHandler,
} = require('../controllers/announcementController');

const router = express.Router();

router.get('/', listAnnouncementsHandler);
router.post('/', createAnnouncementHandler);
router.delete('/:id', deleteAnnouncementHandler);

module.exports = router;
