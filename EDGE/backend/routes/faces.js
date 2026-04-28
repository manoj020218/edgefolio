const express = require('express');
const {
  getFaceStatusHandler,
  enrollFaceHandler,
  deleteEnrollmentHandler,
} = require('../controllers/faceController');

const router = express.Router();

router.get('/:id/status', getFaceStatusHandler);
router.post('/:id/enroll', enrollFaceHandler);
router.delete('/:id', deleteEnrollmentHandler);

module.exports = router;
