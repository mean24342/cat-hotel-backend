const express = require('express');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const bookingController = require('../controllers/booking.controller');
const {
  availabilityQuerySchema,
  quoteSchema,
  createBookingSchema,
  bookingIdParamSchema,
  listBookingsQuerySchema,
} = require('../validators/booking.validators');

const router = express.Router();

// --- Public browsing endpoints (no sign-in required to check availability) ---

// GET /api/v1/bookings/rooms
router.get('/rooms', bookingController.listRooms);

// GET /api/v1/bookings/availability?check_in=&check_out=
// Task 1: "Get Available Slots" - validated against existing bookings
// and room_blockouts (service-provider-side unavailability).
router.get(
  '/availability',
  validate(availabilityQuerySchema, 'query'),
  bookingController.getAvailability
);

// POST /api/v1/bookings/quote  { room_id, check_in, check_out }
router.post('/quote', validate(quoteSchema), bookingController.quote);

// --- Authenticated endpoints ---

// POST /api/v1/bookings  { pet_id, room_id, check_in, check_out, special_requests? }
// Task 2 & 3: creates the booking (double-booking-safe) and records
// pending reward points on the linked purchase. See booking.service.js.
router.post('/', requireAuth, validate(createBookingSchema), bookingController.createBooking);

// GET /api/v1/bookings/me?page=&limit=&status=
router.get(
  '/me',
  requireAuth,
  validate(listBookingsQuerySchema, 'query'),
  bookingController.listMyBookings
);

// GET /api/v1/bookings/:id
router.get(
  '/:id',
  requireAuth,
  validate(bookingIdParamSchema, 'params'),
  bookingController.getBooking
);

// PATCH /api/v1/bookings/:id/cancel
router.patch(
  '/:id/cancel',
  requireAuth,
  validate(bookingIdParamSchema, 'params'),
  bookingController.cancelBooking
);

module.exports = router;
