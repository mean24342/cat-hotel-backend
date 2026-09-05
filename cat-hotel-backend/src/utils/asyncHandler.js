// Wraps an async Express route handler so any rejected promise is
// forwarded to next(err) automatically. Without this, an unhandled
// rejection inside an async route handler would crash the process
// (or hang the request) instead of reaching the error middleware.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
