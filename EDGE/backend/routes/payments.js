const express = require('express');
const {
  listTemplatesHandler, createTemplateHandler, updateTemplateHandler, deleteTemplateHandler,
  listBatchesHandler, getBatchHandler, createBatchHandler, deleteBatchHandler,
  importResponseHandler,
} = require('../controllers/paymentController');
const { validateBody } = require('../middleware/validators');

const router = express.Router();

// Bank Templates
router.get('/templates',       listTemplatesHandler);
router.post('/templates',      validateBody(['templateName', 'bankName']), createTemplateHandler);
router.put('/templates/:id',   validateBody(['templateName', 'bankName']), updateTemplateHandler);
router.delete('/templates/:id', deleteTemplateHandler);

// Payment Batches
router.get('/batches',              listBatchesHandler);
router.post('/batches',             validateBody(['monthKey']), createBatchHandler);
router.get('/batches/:id',          getBatchHandler);
router.delete('/batches/:id',       deleteBatchHandler);
router.post('/batches/:id/import-response', validateBody(['updates']), importResponseHandler);

module.exports = router;
