const express = require('express');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET  /api/v1/auth/line/login     -> redirects browser to LINE's authorize screen
router.get('/line/login', authController.login);

// GET  /api/v1/auth/line/callback  -> LINE redirects here with ?code=&state=
router.get('/line/callback', authController.callback);

// GET  /api/v1/auth/session        -> current signed-in user (requires session cookie)
router.get('/session', requireAuth, authController.session);

// POST /api/v1/auth/logout
router.post('/logout', authController.logout);

module.exports = router;
