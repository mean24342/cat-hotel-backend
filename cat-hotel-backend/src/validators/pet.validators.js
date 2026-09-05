const { z } = require('zod');

const createPetSchema = z.object({
  name: z.string().min(1, 'name is required').max(80),
  species: z.string().max(40).optional(),
  breed: z.string().max(80).optional().nullable(),
  weight_kg: z.coerce.number().positive().max(50).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

module.exports = { createPetSchema };
