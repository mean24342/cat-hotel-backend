const express = require('express');
const validate = require('../middleware/validate');
const userController = require('../controllers/user.controller');
const {
  idParamSchema,
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
} = require('../validators/user.validators');

const router = express.Router();

// POST   /api/v1/users
router.post('/', validate(createUserSchema), userController.createUser);

// GET    /api/v1/users?page=&limit=&search=
router.get('/', validate(listUsersQuerySchema, 'query'), userController.listUsers);

// GET    /api/v1/users/:id
router.get('/:id', validate(idParamSchema, 'params'), userController.getUser);

// PATCH  /api/v1/users/:id
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateUserSchema),
  userController.updateUser
);

// DELETE /api/v1/users/:id
router.delete('/:id', validate(idParamSchema, 'params'), userController.deleteUser);

module.exports = router;
