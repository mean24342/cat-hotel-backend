// Centralized environment configuration.
// Fail fast at boot if required vars are missing, rather than
// discovering a misconfiguration mid-request in production.
require('dotenv').config();

const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'LINE_LOGIN_CHANNEL_ID',
  'LINE_LOGIN_CHANNEL_SECRET',
  'LINE_LOGIN_CALLBACK_URL',
  'LINE_MESSAGING_CHANNEL_SECRET',
  'LINE_MESSAGING_CHANNEL_ACCESS_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  // eslint-disable-next-line no-console
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL,
  pool: {
    max: parseInt(process.env.PG_POOL_MAX, 10) || 10,
    idleTimeoutMillis: parseInt(process.env.PG_POOL_IDLE_TIMEOUT_MS, 10) || 30000,
    connectionTimeoutMillis: parseInt(process.env.PG_POOL_CONN_TIMEOUT_MS, 10) || 5000,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  lineLogin: {
    channelId: process.env.LINE_LOGIN_CHANNEL_ID,
    channelSecret: process.env.LINE_LOGIN_CHANNEL_SECRET,
    callbackUrl: process.env.LINE_LOGIN_CALLBACK_URL,
  },
  lineMessaging: {
    channelSecret: process.env.LINE_MESSAGING_CHANNEL_SECRET,
    channelAccessToken: process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
  },
};
