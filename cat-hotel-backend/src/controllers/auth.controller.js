const crypto = require('crypto');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const lineAuthService = require('../services/line-auth.service');
const userService = require('../services/user.service');
const jwtService = require('../services/jwt.service');
const { SESSION_COOKIE } = require('../middleware/auth');

const STATE_COOKIE = 'line_oauth_state';
const isProd = env.nodeEnv === 'production';

/**
 * Step 1 of LINE Login: redirect the browser to LINE's authorize screen.
 * The frontend simply links/redirects here - e.g.
 *   <a href="https://api.yourapp.com/api/v1/auth/line/login">Log in with LINE</a>
 *
 * We generate a random `state` and store it in a short-lived, httpOnly
 * cookie so the callback can confirm the response came from a request
 * WE initiated (CSRF protection for the OAuth flow). `nonce` is passed
 * through per the OIDC spec even though we only rely on the `state`
 * check here.
 */
const login = asyncHandler(async (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');

  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax', // 'lax' because this cookie must survive the top-level redirect back from LINE
    maxAge: 5 * 60 * 1000, // 5 minutes - the login flow should complete quickly
  });

  const authorizeUrl = lineAuthService.buildAuthorizeUrl({ state, nonce });
  res.redirect(authorizeUrl);
});

/**
 * Step 2: LINE redirects the browser back here with `code` and `state`.
 * We verify state, exchange the code server-side (channel secret never
 * touches the browser), sync the user into our DB, and issue OUR OWN
 * session cookie. The frontend never sees LINE's access token at all.
 */
const callback = asyncHandler(async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;

  if (error) {
    throw new ApiError(400, `LINE Login error: ${error} - ${errorDescription || ''}`);
  }

  const expectedState = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    throw new ApiError(400, 'Invalid or missing OAuth state - possible CSRF attempt or expired login attempt');
  }

  const tokenResponse = await lineAuthService.exchangeCodeForToken(code);
  const profile = await lineAuthService.fetchProfile(tokenResponse.access_token);

  const user = await userService.upsertUserFromLine({
    line_user_id: profile.userId,
    display_name: profile.displayName,
    picture_url: profile.pictureUrl,
  });

  const sessionToken = jwtService.signSession(user);
  res.cookie(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // keep in sync with JWT_EXPIRES_IN
  });

  // Hand control back to the frontend. This targets the static file
  // frontend/auth-callback.html directly since this is a plain
  // multi-page site with no client-side router - if you later move to
  // a framework with routing (e.g. Next.js), change this back to a
  // route path like `/auth/callback`.
  res.redirect(`${env.frontendUrl}/auth-callback.html?login=success`);
});

const session = asyncHandler(async (req, res) => {
  // req.user was attached by the requireAuth middleware
  const user = await userService.getUserById(req.user.sub);
  res.json({ data: user });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.status(204).send();
});

module.exports = { login, callback, session, logout };
