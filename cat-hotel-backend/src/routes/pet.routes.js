const express = require('express');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const petController = require('../controllers/pet.controller');
const { createPetSchema } = require('../validators/pet.validators');

const router = express.Router();

// GET  /api/v1/pets/me
router.get('/me', requireAuth, petController.listMyPets);

// POST /api/v1/pets  { name, species?, breed?, weight_kg?, notes? }
router.post('/', requireAuth, validate(createPetSchema), petController.createPet);

module.exports = router;
