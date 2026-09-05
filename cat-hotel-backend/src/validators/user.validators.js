const { z } = require('zod');

// UUID param validation, reused by both user and points routes.
const idParamSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

const createUserSchema = z.object({
  line_user_id: z.string().min(1, 'line_user_id is required'),
  display_name: z.string().min(1, 'display_name is required').max(120),
  picture_url: z.string().url().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  role: z.enum(['customer', 'staff', 'admin']).optional(), // defaults to 'customer' in DB
});

// PATCH allows partial updates - every field optional, but at least one
// must be present (checked in the controller) so empty PATCHes are rejected.
const updateUserSchema = z.object({
  display_name: z.string().min(1).max(120).optional(),
  picture_url: z.string().url().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  role: z.enum(['customer', 'staff', 'admin']).optional(),
  tier_id: z.string().uuid().optional().nullable(),
});

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(), // matches against display_name or email
});

module.exports = {
  idParamSchema,
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
};
