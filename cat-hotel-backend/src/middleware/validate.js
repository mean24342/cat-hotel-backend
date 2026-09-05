const ApiError = require('../utils/ApiError');

/**
 * Generic request-validation middleware factory built on Zod schemas.
 * Usage: router.post('/', validate(createUserSchema), controller.create)
 *
 * `source` selects which part of the request to validate ('body' | 'params' | 'query').
 * On success, the parsed (and type-coerced) value REPLACES req[source], so
 * downstream handlers can trust it's already the right shape.
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return next(new ApiError(400, 'Validation failed', details));
  }

  req[source] = result.data;
  return next();
};

module.exports = validate;
