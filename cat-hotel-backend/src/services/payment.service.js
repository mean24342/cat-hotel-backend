const stripe = require('../config/stripe-client');
const env = require('../config/env');
const { query, getClient } = require('../config/db');
const ApiError = require('../utils/ApiError');
const pointsService = require('./points.service');

/**
 * ============================================================
 * CREATE PAYMENT INTENT
 * ============================================================
 * Called when the user confirms a pending booking and moves to
 * checkout. Reuses the `purchases` row that booking.service.js
 * already created (with its pending `points_earned` amount) - this
 * function's only job is to attach a Stripe PaymentIntent to it and
 * hand back a client_secret for the frontend to confirm payment with.
 *
 * THAI PAYMENT METHODS: `payment_method_types: ['card', 'promptpay']`
 * explicitly enables both requested rails. PromptPay is an
 * Asia/Thailand-specific "voucher" method - the customer scans a QR
 * code rather than entering card details, and confirmation is
 * asynchronous (the bank notifies Stripe some seconds/minutes later),
 * which is exactly why we NEVER trust the client-side redirect after
 * `stripe.confirmPayment()` as proof of payment - only the webhook,
 * verified server-side, can confirm a charge actually succeeded.
 */
async function createPaymentIntentForBooking(userId, bookingId) {
  const { rows: bookingRows } = await query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
  if (bookingRows.length === 0) {
    throw new ApiError(404, 'Booking not found');
  }
  const booking = bookingRows[0];

  if (booking.user_id !== userId) {
    throw new ApiError(403, 'This booking does not belong to you');
  }
  if (booking.status !== 'pending') {
    throw new ApiError(400, `Cannot pay for a booking with status '${booking.status}'`);
  }

  const { rows: purchaseRows } = await query(
    `SELECT * FROM purchases
     WHERE reference_id = $1 AND purchase_type = 'booking'
     ORDER BY created_at DESC LIMIT 1`,
    [bookingId]
  );
  if (purchaseRows.length === 0) {
    throw new ApiError(404, 'No purchase record found for this booking');
  }
  const purchase = purchaseRows[0];

  // --- Idempotency: don't spin up a duplicate PaymentIntent if the
  // user reloads the checkout page or double-clicks "Pay". ---
  if (purchase.payment_id) {
    const { rows: existingRows } = await query('SELECT * FROM payments WHERE id = $1', [purchase.payment_id]);
    const existing = existingRows[0];

    if (existing?.status === 'paid') {
      throw new ApiError(409, 'This booking has already been paid');
    }

    if (existing?.status === 'pending' && existing.gateway === 'stripe') {
      const intent = await stripe.paymentIntents.retrieve(existing.gateway_charge_id);
      if (intent.status === 'succeeded' || intent.status === 'processing') {
        // Stripe already has this as paid/processing but our webhook
        // hasn't landed yet (delivery lag) - don't create a second
        // intent; tell the caller to wait rather than double-charge.
        throw new ApiError(409, 'Payment is already being processed for this booking');
      }
      return {
        client_secret: intent.client_secret,
        publishable_key: env.stripe.publishableKey,
        amount: existing.amount,
        currency: existing.currency,
      };
    }
  }

  // Stripe amounts are in the currency's smallest unit - THB has 2
  // decimal places like most currencies, so multiply by 100 (satang).
  const amountInSmallestUnit = Math.round(Number(purchase.amount) * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInSmallestUnit,
    currency: 'thb',
    payment_method_types: ['card', 'promptpay'],
    // Metadata is how the webhook (and Stripe Dashboard, for support/debugging)
    // traces a Stripe object back to our own records without guessing.
    metadata: {
      purchase_id: purchase.id,
      booking_id: booking.id,
      user_id: userId,
    },
  });

  const { rows: paymentRows } = await query(
    `INSERT INTO payments (user_id, gateway, gateway_charge_id, amount, currency, status, raw_response)
     VALUES ($1, 'stripe', $2, $3, 'THB', 'pending', $4)
     RETURNING *`,
    [userId, paymentIntent.id, purchase.amount, JSON.stringify(paymentIntent)]
  );
  const payment = paymentRows[0];

  await query('UPDATE purchases SET payment_id = $1 WHERE id = $2', [payment.id, purchase.id]);

  return {
    client_secret: paymentIntent.client_secret,
    publishable_key: env.stripe.publishableKey,
    amount: payment.amount,
    currency: payment.currency,
  };
}

/**
 * ============================================================
 * WEBHOOK: CONFIRM PAYMENT + UNLOCK POINTS
 * ============================================================
 * Called by the webhook route once Stripe's signature has been
 * verified (see routes/payment-webhook.routes.js - signature
 * verification happens BEFORE this function is ever reached, so by
 * the time we're here we trust `paymentIntentId` genuinely came from
 * Stripe).
 *
 * Everything below runs in ONE transaction:
 *   1. Mark the payment 'paid'      - guarded by `WHERE status='pending'`,
 *      which doubles as our idempotency check (see below).
 *   2. Confirm the booking          (status: pending -> confirmed).
 *   3. UNLOCK PENDING POINTS: credit `purchases.points_earned` into
 *      the real points_ledger/users.points_balance via
 *      points.service.adjustPoints(), composed into this SAME
 *      transaction via the `client` param added there. This is the
 *      "pending -> active" conversion the task asked for: the points
 *      amount was computed and stored at booking time, but only
 *      actually credited here, now that money has genuinely moved.
 *
 * IDEMPOTENCY: Stripe explicitly documents that webhooks can be
 * delivered more than once for the same event, and we also listen to
 * two events that can both represent "payment succeeded" (see the
 * route). The `UPDATE payments ... WHERE status = 'pending'` clause
 * means a second delivery finds 0 rows to update and safely no-ops -
 * it is impossible for this function to credit points twice for the
 * same payment, no matter how many times Stripe calls it.
 */
async function handleSuccessfulPayment(paymentIntentId, rawEventPayload) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { rows: paymentRows } = await client.query(
      `UPDATE payments
       SET status = 'paid', paid_at = now(), raw_response = $1
       WHERE gateway_charge_id = $2 AND status = 'pending'
       RETURNING *`,
      [JSON.stringify(rawEventPayload), paymentIntentId]
    );

    if (paymentRows.length === 0) {
      // Either we don't recognize this payment_intent (not created by
      // us), or it was already processed by an earlier delivery of
      // this same event. Both are safe, silent no-ops.
      await client.query('ROLLBACK');
      return { processed: false };
    }
    const payment = paymentRows[0];

    const { rows: purchaseRows } = await client.query(
      'SELECT * FROM purchases WHERE payment_id = $1',
      [payment.id]
    );
    const purchase = purchaseRows[0] || null;

    if (purchase?.purchase_type === 'booking') {
      await client.query(
        `UPDATE bookings SET status = 'confirmed', updated_at = now()
         WHERE id = $1 AND status = 'pending'`,
        [purchase.reference_id]
      );
    }

    if (purchase && purchase.points_earned > 0) {
      await pointsService.adjustPoints(
        payment.user_id,
        {
          points: purchase.points_earned,
          entry_type: 'earn',
          reference_type: 'purchase',
          reference_id: purchase.id,
          note: 'Points unlocked from confirmed booking payment',
        },
        client // <- composes into THIS transaction, see points.service.js
      );
    }

    await client.query('COMMIT');
    return { processed: true, payment, purchase };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Handles a failed/cancelled PaymentIntent so the payment row (and any
 * frontend polling it) reflects reality instead of sitting 'pending'
 * forever. Does NOT touch bookings/points - a failed payment simply
 * means the user can retry checkout; the booking itself is only
 * cancelled if the user explicitly cancels it or it expires (a
 * scheduled job, outside this task's scope).
 */
async function handleFailedPayment(paymentIntentId, rawEventPayload) {
  await query(
    `UPDATE payments
     SET status = 'failed', raw_response = $1
     WHERE gateway_charge_id = $2 AND status = 'pending'`,
    [JSON.stringify(rawEventPayload), paymentIntentId]
  );
}

module.exports = { createPaymentIntentForBooking, handleSuccessfulPayment, handleFailedPayment };
