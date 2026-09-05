// Single shared Stripe SDK instance. The secret key never leaves the
// backend process - it is NOT the same as the publishable key, which
// is safe to expose to the frontend (see payment.service.js).
const Stripe = require('stripe');
const env = require('./env');

const stripe = new Stripe(env.stripe.secretKey, {
  apiVersion: '2024-06-20', // pin explicitly so a Stripe account-level API upgrade can't silently change response shapes under us
});

module.exports = stripe;
