const express = require('express');
const validate = require('../middleware/validate');
const pointsController = require('../controllers/points.controller');
const {
  userIdParamSchema,
  historyQuerySchema,
  adjustPointsSchema,
} = require('../validators/points.validators');

const router = express.Router();

// GET  /api/v1/points/:userId/balance
router.get(
  '/:userId/balance',
  validate(userIdParamSchema, 'params'),
  pointsController.getBalance
);

// GET  /api/v1/points/:userId/history?page=&limit=
router.get(
  '/:userId/history',
  validate(userIdParamSchema, 'params'),
  validate(historyQuerySchema, 'query'),
  pointsController.getHistory
);

// POST /api/v1/points/:userId/adjust
// Body: { points, entry_type, reference_type?, reference_id?, note? }
// This is the ONE path that mutates points - see points.service.js
// for how balance integrity is enforced.
router.post(
  '/:userId/adjust',
  validate(userIdParamSchema, 'params'),
  validate(adjustPointsSchema),
  pointsController.adjustPoints
);

module.exports = router;
