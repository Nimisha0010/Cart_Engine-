const Joi = require('joi');

/**
 * Generic validation middleware factory. Validates req.body against the
 * given Joi schema and short-circuits with a structured 400 on failure,
 * per the assignment's "Input Validation & Security" requirement.
 */
function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Validation failed for request body.',
        details: error.details.map((d) => ({
          field: d.path.join('.'),
          message: d.message,
        })),
      });
    }

    req.body = value;
    next();
  };
}

function validateParams(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Validation failed for request parameters.',
        details: error.details.map((d) => ({
          field: d.path.join('.'),
          message: d.message,
        })),
      });
    }
    req.params = value;
    next();
  };
}

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const schemas = {
  addOrUpdateItem: Joi.object({
    sku: Joi.string().trim().uppercase().min(1).max(64).required(),
    quantity: Joi.number().integer().min(1).max(999).required(),
    // 'set' replaces the line quantity outright; 'increment' adds to it.
    mode: Joi.string().valid('increment', 'set').default('increment'),
  }),

  removeItem: Joi.object({
    sku: Joi.string()
      .trim()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .messages({ 'string.pattern.base': '"sku" param must be a valid SKU segment' }),
  }),

  createProduct: Joi.object({
    sku: Joi.string().trim().uppercase().min(1).max(64).required(),
    name: Joi.string().trim().min(1).max(200).required(),
    category: Joi.string().trim().lowercase().min(1).max(80).required(),
    price: Joi.number().min(0).precision(2).required(),
    currency: Joi.string().trim().uppercase().length(3).default('INR'),
    stock: Joi.number().integer().min(0).default(0),
  }),

  cartItemParam: Joi.object({
    sku: Joi.string().trim().min(1).max(64).required(),
  }),

  mongoIdParam: Joi.object({
    id: Joi.string().pattern(objectIdPattern).required().messages({
      'string.pattern.base': '"id" must be a valid MongoDB ObjectId',
    }),
  }),
};

module.exports = { validateBody, validateParams, schemas };
