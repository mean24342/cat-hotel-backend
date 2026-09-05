const express = require('express');
const userRoutes = require('./user.routes');
const pointsRoutes = require('./points.routes');
const authRoutes = require('./auth.routes');
const bookingRoutes = require('./booking.routes');
const paymentRoutes = require('./payment.routes');
const petRoutes = require('./pet.routes');

const router = express.Router();

router.use('/users', userRoutes);
router.use('/points', pointsRoutes);
router.use('/auth', authRoutes);
router.use('/bookings', bookingRoutes);
router.use('/payments', paymentRoutes);
router.use('/pets', petRoutes);
// NOTE: the LINE webhook (/api/v1/line/webhook) and Stripe webhook
// (/api/v1/payments/webhook) routes are mounted directly on the app in
// app.js, NOT here - both must run before the global express.json()
// body parser. See app.js for why.

module.exports = router;
