// Minimal pet lookups needed to validate bookings. Full pet CRUD
// (POST/PATCH/DELETE /users/me/pets) is a separate module - this file
// only covers what the Booking System needs: "does this pet exist,
// and does it belong to the user making the booking?"
const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');

async function getPetById(id) {
  const { rows } = await query(
    'SELECT id, user_id, name, species FROM pets WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

/**
 * Throws if the pet doesn't exist or doesn't belong to userId. Kept as
 * a single explicit check (rather than trusting a JOIN/FK alone) so a
 * user can never book a stay for someone else's cat by guessing a
 * pet_id, even though the FK guarantees the pet_id itself is valid.
 */
async function assertPetBelongsToUser(petId, userId) {
  const pet = await getPetById(petId);
  if (!pet) {
    throw new ApiError(404, 'Pet not found');
  }
  if (pet.user_id !== userId) {
    throw new ApiError(403, 'This pet does not belong to the requesting user');
  }
  return pet;
}

async function listPetsForUser(userId) {
  const { rows } = await query(
    `SELECT id, user_id, name, species, breed, weight_kg, notes, vaccination_doc_url, created_at
     FROM pets WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function createPet(userId, { name, species, breed, weight_kg, notes }) {
  const { rows } = await query(
    `INSERT INTO pets (user_id, name, species, breed, weight_kg, notes)
     VALUES ($1, $2, COALESCE($3, 'cat'), $4, $5, $6)
     RETURNING id, user_id, name, species, breed, weight_kg, notes, vaccination_doc_url, created_at`,
    [userId, name, species ?? null, breed ?? null, weight_kg ?? null, notes ?? null]
  );
  return rows[0];
}

module.exports = { getPetById, assertPetBelongsToUser, listPetsForUser, createPet };
