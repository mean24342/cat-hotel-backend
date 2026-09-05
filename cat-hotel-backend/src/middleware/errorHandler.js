const env = require('../config/env');

// Central error handler - must be registered LAST, after all routes.
// Every thrown/forwarded error (ApiError or otherwise) ends up here,
// so this is the single place that decides the JSON error shape.
// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  const statusCode = err.isApiError ? err.statusCode : 500;
  const message = err.isApiError ? err.message : 'Internal server error';

  if (statusCode >= 500) {
    // Unexpected errors are logged with full detail server-side,
    // but never leaked to the client in production.
    // eslint-disable-next-line no-console
    console.error(err);
  }

  res.status(statusCode).json({
    error: {
      message,
      details: err.details || undefined,
      stack: env.nodeEnv === 'development' ? err.stack : undefined,
    },
  });
};
