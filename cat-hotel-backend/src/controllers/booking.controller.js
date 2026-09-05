const asyncHandler = require('../utils/asyncHandler');
const bookingService = require('../services/booking.service');
const roomService = require('../services/room.service');

const listRooms = asyncHandler(async (req, res) => {
  const rooms = await roomService.listActiveRooms();
  res.json({ data: rooms });
});

const getAvailability = asyncHandler(async (req, res) => {
  const availability = await bookingService.getAvailability(req.query);
  res.json({ data: availability });
});

const quote = asyncHandler(async (req, res) => {
  const result = await bookingService.quoteBooking(req.body);
  res.json({ data: result });
});

const createBooking = asyncHandler(async (req, res) => {
  const result = await bookingService.createBooking(req.user.sub, req.body);
  res.status(201).json({ data: result });
});

const listMyBookings = asyncHandler(async (req, res) => {
  const result = await bookingService.listBookingsForUser(req.user.sub, req.query);
  res.json(result);
});

const getBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.getBookingById(req.params.id);
  bookingService.assertBookingOwnership(booking, req.user);
  res.json({ data: booking });
});

const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.cancelBooking(req.params.id, req.user);
  res.json({ data: booking });
});

module.exports = {
  listRooms,
  getAvailability,
  quote,
  createBooking,
  listMyBookings,
  getBooking,
  cancelBooking,
};
