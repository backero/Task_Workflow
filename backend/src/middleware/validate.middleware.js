const { badRequest } = require('../utils/response');

/**
 * Validates req.body against a Joi schema.
 * Usage: validate(schema) as route middleware.
 */
const validate = (schema, target = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[target], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
      }));
      return badRequest(res, 'Validation failed', errors);
    }

    req[target] = value;
    next();
  };
};

module.exports = { validate };
