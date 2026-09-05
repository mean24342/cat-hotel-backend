const { z } = require('zod');

const userIdParamSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Core validation for point mutations:
//  - `points` must be a non-zero integer. Positive = credit, negative = debit.
//    We require the CALLER to encode direction explicitly rather than
//    inferring it from entry_type, so the ledger's stored sign is always
//    unambiguous and matches exactly what was requested.
//  - `entry_type` constrains WHY the points moved, enforced again at the
//    DB layer via a CHECK constraint as defense in depth.
const adjustPointsSchema = z.object({
  points: z
    .number()
    .int('points must be an integer')
    .refine((val) => val !== 0, 'points must not be zero'),
  entry_type: z.enum(['earn', 'redeem', 'expire', 'adjustment']),
  reference_type: z.enum(['purchase', 'booking', 'manual']).optional().nullable(),
  reference_id: z.string().uuid().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

module.exports = {
  userIdParamSchema,
  historyQuerySchema,
  adjustPointsSchema,
};
