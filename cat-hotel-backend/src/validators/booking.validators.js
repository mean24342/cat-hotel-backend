const { z } = require('zod');

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

const availabilityQuerySchema = z.object({
  check_in: dateOnly,
  check_out: dateOnly,
});

const quoteSchema = z.object({
  room_id: z.string().uuid(),
  check_in: dateOnly,
  check_out: dateOnly,
});

const createBookingSchema = z.object({
  pet_id: z.string().uuid(),
  room_id: z.string().uuid(),
  check_in: dateOnly,
  check_out: dateOnly,
  special_requests: z.string().max(1000).optional().nullable(),
});

const bookingIdParamSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

const listBookingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show']).optional(),
});

module.exports = {
  availabilityQuerySchema,
  quoteSchema,
  createBookingSchema,
  bookingIdParamSchema,
  listBookingsQuerySchema,
};
