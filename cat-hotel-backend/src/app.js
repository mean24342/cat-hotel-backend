const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const routes = require('./routes');
const lineWebhookRoutes = require('./routes/line-webhook.routes');
const paymentWebhookRoutes = require('./routes/payment-webhook.routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
// `credentials: true` + an explicit origin (not '*') are required for the
// browser to send/receive our httpOnly session cookie cross-origin
// (frontend and backend are typically on different domains/ports).
app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));

// ------------------------------------------------------------------
// Webhooks that verify a raw-body signature MUST be mounted before
// express.json(). Both the LINE bot SDK and Stripe SDK compute their
// signatures over the exact raw request bytes; once express.json()
// parses (and effectively re-serializes) the body, signature
// verification would fail for every delivery.
//   LINE webhook:   POST /api/v1/line/webhook
//   Stripe webhook: POST /api/v1/payments/webhook
// ------------------------------------------------------------------
app.use('/api/v1/line', lineWebhookRoutes);
app.use('/api/v1/payments', paymentWebhookRoutes);

// Body/cookie parsing for every other route.
app.use(express.json());
app.use(cookieParser());

// Lightweight liveness check for uptime monitoring / load balancer probes.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use('/api/v1', routes);

// Order matters: notFound catches unmatched routes, errorHandler must be
// registered last so Express recognizes it as the error-handling middleware
// (4-arity function signature).
app.use(notFound);
app.use(errorHandler);

module.exports = app;
