const jwtService = require('../services/jwt.service');
const ApiError = require('../utils/ApiError');

const SESSION_COOKIE = 'session';

/**
 * Verifies the session cookie (or, as a fallback, a Bearer token - useful
 * for non-browser clients like a future mobile app) and attaches the
 * decoded payload to req.user. Use on any route that requires a signed-in
 * user.
 */
function requireAuth(req, res, next) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = req.cookies?.[SESSION_COOKIE] || bearer;

  if (!token) {
    return next(new ApiError(401, 'Not authenticated'));
  }

  try {
    req.user = jwtService.verifySession(token);
    return next();
  } catch (err) {
    return next(new ApiError(401, 'Invalid or expired session'));
  }
}

module.exports = { requireAuth, SESSION_COOKIE };
