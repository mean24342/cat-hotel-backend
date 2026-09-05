const ApiError = require('../utils/ApiError');

// Catches any request that didn't match a defined route.
module.exports = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};
