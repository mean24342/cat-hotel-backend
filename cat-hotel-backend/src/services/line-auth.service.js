// Implements the LINE Login OAuth 2.0 "Authorization Code" flow.
// Docs: https://developers.line.biz/en/docs/line-login/integrate-line-login/
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const LINE_AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize';
const LINE_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token';
const LINE_PROFILE_URL = 'https://api.line.me/v2/profile';

/**
 * Builds the URL the frontend redirects the user to in order to start
 * LINE Login. `state` and `nonce` are random, single-use strings the
 * caller generates and stores (e.g. in a short-lived cookie) so the
 * callback step can verify the response actually belongs to this
 * browser session (CSRF protection) - see auth.routes.js.
 */
function buildAuthorizeUrl({ state, nonce }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.lineLogin.channelId,
    redirect_uri: env.lineLogin.callbackUrl,
    state,
    scope: 'profile openid',
    nonce,
  });
  return `${LINE_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchanges the one-time `code` LINE sent to our callback for an
 * access token. This call happens server-to-server (never expose
 * the channel secret to the frontend).
 */
async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.lineLogin.callbackUrl,
    client_id: env.lineLogin.channelId,
    client_secret: env.lineLogin.channelSecret,
  });

  const response = await fetch(LINE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new ApiError(502, `LINE token exchange failed: ${errText}`);
  }

  return response.json(); // { access_token, id_token, expires_in, refresh_token, scope, token_type }
}

/**
 * Fetches the LINE profile (userId, displayName, pictureUrl) using the
 * access token obtained above. `userId` here is LINE's stable,
 * per-channel user identifier - this is what we store as
 * users.line_user_id.
 */
async function fetchProfile(accessToken) {
  const response = await fetch(LINE_PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new ApiError(502, `LINE profile fetch failed: ${errText}`);
  }

  return response.json(); // { userId, displayName, pictureUrl, statusMessage }
}

module.exports = { buildAuthorizeUrl, exchangeCodeForToken, fetchProfile };
