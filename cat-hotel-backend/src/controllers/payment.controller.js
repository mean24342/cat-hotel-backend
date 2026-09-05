const asyncHandler = require('../utils/asyncHandler');
const paymentService = require('../services/payment.service');

const createIntent = asyncHandler(async (req, res) => {
  const result = await paymentService.createPaymentIntentForBooking(req.user.sub, req.params.bookingId);
  res.status(201).json({ data: result });
});

module.exports = { createIntent };
