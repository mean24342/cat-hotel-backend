// Issues and verifies the session token we set as a cookie after a
// successful LINE Login. This is OUR app's session, separate from any
// token LINE itself issues - once we've exchanged the LINE auth code
// and synced the user, we no longer need LINE's tokens for session
// purposes.
const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signSession(user) {
  return jwt.sign(
    { sub: user.id, line_user_id: user.line_user_id, role: user.role },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );
}

function verifySession(token) {
  // Throws if invalid/expired - caller (auth middleware) handles the error.
  return jwt.verify(token, env.jwt.secret);
}

module.exports = { signSession, verifySession };
