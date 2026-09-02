const express = require('express');
const { listDocumentsHandler, uploadDocumentHandler } = require('../controllers/documentsController');

const router = express.Router();

router.get('/', listDocumentsHandler);
router.post('/', uploadDocumentHandler);

module.exports = router;
