const express = require('express');
const stripe = require('../config/stripe-client');
const env = require('../config/env');
const paymentService = require('../services/payment.service');

const router = express.Router();

/**
 * ============================================================
 * SECURE STRIPE WEBHOOK
 * ============================================================
 * `express.raw({ type: 'application/json' })` is used INSTEAD of the
 * global express.json() for this one route. `stripe.webhooks.constructEvent`
 * verifies the `Stripe-Signature` header against the exact raw request
 * body bytes - if the body were already parsed/re-serialized by
 * express.json() first, the byte-for-byte signature check would fail.
 * This is why this router, like the LINE webhook, is mounted in app.js
 * BEFORE the global JSON body parser.
 *
 * This signature check is what makes the endpoint SECURE: without it,
 * anyone who found this URL could POST a fake "payment succeeded"
 * body and unlock points / confirm bookings for free. We only trust
 * the payload after `constructEvent` succeeds.
 *
 * Events handled:
 *   - charge.succeeded            (explicitly requested by the task)
 *   - payment_intent.succeeded    (Stripe's recommended event for
 *     confirming payment across BOTH sync methods like cards and
 *     async/delayed-notification methods like PromptPay - included so
 *     PromptPay payments, which are confirmed by a bank notification
 *     rather than instantly, are never missed)
 *   - payment_intent.payment_failed
 *
 * Both success events funnel into the SAME
 * payment.service.handleSuccessfulPayment(), which is idempotent (see
 * that file) - so listening to both is safe even though Stripe may
 * fire both for a single successful card payment.
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, env.stripe.webhookSecret);
    } catch (err) {
      // Signature invalid or payload tampered with - reject with 400.
      // Do NOT process req.body in any way past this point.
      // eslint-disable-next-line no-console
      console.error('Stripe webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'charge.succeeded': {
          const charge = event.data.object;
          // A charge is always attached to the PaymentIntent that
          // created it - that PaymentIntent id is what we stored as
          // payments.gateway_charge_id at creation time.
          await paymentService.handleSuccessfulPayment(charge.payment_intent, event.data.object);
          break;
        }

        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object;
          await paymentService.handleSuccessfulPayment(paymentIntent.id, event.data.object);
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object;
          await paymentService.handleFailedPayment(paymentIntent.id, event.data.object);
          break;
        }

        default:
          // Unhandled event types are expected and fine - Stripe sends
          // many event types we don't act on. Just acknowledge them.
          break;
      }

      // 2xx tells Stripe delivery succeeded - it will keep retrying
      // (with backoff) until it gets one, so any error thrown above
      // must NOT reach this point uncaught, or Stripe will retry
      // forever for a bug that isn't its fault. See catch block below.
      res.status(200).json({ received: true });
    } catch (err) {
      // A genuine processing error (e.g. DB unreachable) - respond 500
      // so Stripe retries the delivery later, since the event itself
      // was valid and we do want another attempt.
      // eslint-disable-next-line no-console
      console.error('Error processing Stripe webhook event:', event.type, err);
      res.status(500).json({ received: false });
    }
  }
);

module.exports = router;
