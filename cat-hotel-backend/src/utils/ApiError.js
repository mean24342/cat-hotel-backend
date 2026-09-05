// A typed error carrying an HTTP status code, so route handlers can
// `throw new ApiError(404, 'User not found')` and let the central
// error middleware translate it into a consistent JSON response.
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isApiError = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;
