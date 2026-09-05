const asyncHandler = require('../utils/asyncHandler');
const petService = require('../services/pet.service');

const listMyPets = asyncHandler(async (req, res) => {
  const pets = await petService.listPetsForUser(req.user.sub);
  res.json({ data: pets });
});

const createPet = asyncHandler(async (req, res) => {
  const pet = await petService.createPet(req.user.sub, req.body);
  res.status(201).json({ data: pet });
});

module.exports = { listMyPets, createPet };
