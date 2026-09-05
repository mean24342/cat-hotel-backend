const express = require('express');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const paymentController = require('../controllers/payment.controller');
const { bookingIdParamSchema } = require('../validators/payment.validators');

const router = express.Router();

// POST /api/v1/payments/bookings/:bookingId/intent
// Creates (or idempotently reuses) a Stripe PaymentIntent for a
// pending booking's linked purchase. Returns the client_secret the
// frontend needs to call stripe.confirmPayment().
router.post(
  '/bookings/:bookingId/intent',
  requireAuth,
  validate(bookingIdParamSchema, 'params'),
  paymentController.createIntent
);

module.exports = router;
