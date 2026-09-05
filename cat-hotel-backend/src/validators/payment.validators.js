const { z } = require('zod');

const bookingIdParamSchema = z.object({
  bookingId: z.string().uuid('bookingId must be a valid UUID'),
});

module.exports = { bookingIdParamSchema };
